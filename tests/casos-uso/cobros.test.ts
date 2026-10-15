/**
 * Cobros de facturas (F2-07, ADR 0037), contra el Postgres de verdad del
 * arnés: cobro parcial, retención, cobrar de más, tipo de cambio, días desde
 * la factura, anulación, dos cobros a la vez, el avance de un servicio y de
 * una orden de compra, y *Por cobrar*. Datos inventados. Necesita Docker.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { crearGeneradorIdCrypto } from "../../src/adaptadores/memoria/generador-id.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearTransaccionalPrisma } from "../../src/adaptadores/prisma/transaccion.ts";
import { crearCasosUsoAbm } from "../../src/casos-uso/abm/abm.ts";
import { CUENTAS } from "../../src/casos-uso/abm/cuentas.ts";
import type { Escrito } from "../../src/casos-uso/abm/definicion.ts";
import { crearCasosUsoCobros } from "../../src/casos-uso/servicios/cobros.ts";
import { crearCasosUsoFacturas } from "../../src/casos-uso/servicios/facturas.ts";
import { crearCasosUsoOrdenesDeCompra } from "../../src/casos-uso/servicios/ordenes-de-compra.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { nuevaClaveDocumento } from "../../src/infraestructura/arranque/almacen.ts";
import type { AlmacenDocumentos } from "../../src/puertos/almacen-documentos.ts";
import {
  ADMIN_UNO,
  EX_ADMIN,
  sembrarUsuarios,
  type UsuarioSembrado,
} from "./_arnes/administradores.ts";
import {
  type AlmacenTemporal,
  crearAlmacenTemporal,
} from "./_arnes/almacen-temporal.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import { altaDeServicio, sembrarServicio } from "./_arnes/servicio.ts";

const HOY = (() => {
  const resultado = crearFechaHora({
    anio: 2031,
    mes: 7,
    dia: 9,
    hora: 10,
    minuto: 30,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
})();

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
const almacenes: AlmacenTemporal[] = [];
let almacen: AlmacenDocumentos;
let usuarios: readonly UsuarioSembrado[];
let admin: Actor;
let exAdmin: Actor;
let servicioId: string;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function dependencias() {
  return {
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(HOY),
    generadorId: crearGeneradorIdCrypto(),
  };
}

const cobros = () => crearCasosUsoCobros(dependencias());

function ordenes() {
  return crearCasosUsoOrdenesDeCompra({
    ...dependencias(),
    almacen,
    nuevaClave: nuevaClaveDocumento,
  });
}

function facturas() {
  return crearCasosUsoFacturas({
    ...dependencias(),
    almacen,
    nuevaClave: nuevaClaveDocumento,
  });
}

function persona(indice: number): Actor {
  const usuario = usuarios[indice];
  if (usuario === undefined) {
    throw new Error(`no se sembró el usuario ${indice}`);
  }
  return { tipo: "persona", usuarioId: usuario.id };
}

/** Una factura de 1.000,00 sin IVA al 21 %: total con IVA 1.210,00. */
async function cargarFactura(
  cambios: Escrito = {},
  paraServicio = servicioId,
): Promise<string> {
  const resultado = await facturas().crear(
    admin,
    paraServicio,
    {
      numero: "0000-0001",
      fecha: "2031-07-04",
      vencimiento: "2031-08-08",
      importe: "1.000,00",
      importeMoneda: "ARS",
      alicuota: "210",
      ordenCompraId: "",
      ...cambios,
    },
    null,
  );
  if (!resultado.ok) {
    throw new Error(`la factura no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.id;
}

async function cargarOrden(
  cambios: Escrito = {},
  paraServicio = servicioId,
): Promise<string> {
  const resultado = await ordenes().crear(
    admin,
    paraServicio,
    {
      numero: "OC-0001",
      fecha: "2031-07-01",
      importe: "5.000,00",
      importeMoneda: "ARS",
      observaciones: "",
      ...cambios,
    },
    null,
  );
  if (!resultado.ok) {
    throw new Error(`la orden no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.id;
}

async function altaDeCuenta(
  nombre: string,
  moneda: "ARS" | "USD",
  activa = true,
): Promise<string> {
  const resultado = await crearCasosUsoAbm(dependencias()).crear(
    admin,
    CUENTAS,
    {
      nombre,
      tipo: "banco",
      moneda,
      observaciones: "",
      activa: activa ? "si" : "",
    },
  );
  if (!resultado.ok) {
    throw new Error(`la cuenta no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.registro.valor.id;
}

function cobro(cuentaId: string, cambios: Escrito = {}): Escrito {
  return {
    fecha: "2031-07-09",
    importe: "400,00",
    retencion: "",
    cuentaId,
    tipoDeCambio: "",
    fuenteDelCambio: "",
    observaciones: "",
    ...cambios,
  };
}

/** Registra un cobro que tiene que pasar, o el test se cae con lo que faltó. */
async function cobrado(
  facturaId: string,
  cuentaId: string,
  cambios: Escrito = {},
): Promise<void> {
  const resultado = await cobros().registrar(
    admin,
    facturaId,
    cobro(cuentaId, cambios),
  );
  if (!resultado.ok) {
    throw new Error(`el cobro no pasó: ${JSON.stringify(resultado.errores)}`);
  }
}

async function cobranzaDe(facturaId: string, paraServicio = servicioId) {
  const cobranza = (await cobros().cobranza(paraServicio)).find(
    (fila) => fila.facturaId === facturaId,
  );
  expect(cobranza, "la factura no aparece en la cobranza").toBeDefined();
  return cobranza as NonNullable<typeof cobranza>;
}

const cantidadDeCobros = () => cliente().cobro.count();

beforeAll(() => {
  prisma = crearClientePrisma(uriBaseCompartida());
});

afterAll(async () => {
  await prisma?.$disconnect();
  await Promise.all(almacenes.map((usado) => usado.borrar()));
});

beforeEach(async () => {
  await limpiarBase();
  const temporal = await crearAlmacenTemporal();
  almacenes.push(temporal);
  ({ almacen } = temporal);
  usuarios = await sembrarUsuarios(cliente(), [ADMIN_UNO, EX_ADMIN]);
  admin = persona(0);
  exAdmin = persona(1);
  servicioId = await sembrarServicio(
    cliente(),
    dependencias(),
    admin,
    usuarios[0]?.id ?? "",
  );
});

describe("cobrar una factura", () => {
  test("un cobro parcial guarda sus datos con su auditoría y la factura muestra cobrado, retenido y saldo", async () => {
    const factura = await cargarFactura();
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");

    const resultado = await cobros().registrar(
      admin,
      factura,
      cobro(cuenta, { importe: "400,00", observaciones: "Primer cobro" }),
    );

    expect(resultado).toEqual({ ok: true });
    const fila = await cliente().cobro.findFirstOrThrow();
    expect(fila).toMatchObject({
      facturaId: factura,
      fecha: new Date("2031-07-09T00:00:00.000Z"),
      importeCentavos: 40_000n,
      importeMoneda: "ARS",
      retencionCentavos: null,
      cuentaId: cuenta,
      entradaCentavos: 40_000n,
      entradaMoneda: "ARS",
      cambioNumerador: null,
      observaciones: "Primer cobro",
      creadoPor: admin,
    });
    const cobranza = await cobranzaDe(factura);
    expect(cobranza).toMatchObject({
      total: "ARS 1.210,00",
      cobrado: "ARS 400,00",
      retenido: "ARS 0,00",
      saldo: "ARS 810,00",
      cobrada: false,
    });
    const auditoria = await cliente().auditoria.findMany({
      where: { entidad: "Cobro", entidadId: fila.id },
    });
    expect(auditoria.map(({ accion }) => accion)).toEqual(["crear"]);
  });

  test("dos cobros parciales, uno con retención, saldan la factura: queda cobrada", async () => {
    const factura = await cargarFactura();
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");

    await cobrado(factura, cuenta, { importe: "500,00" });
    await cobrado(factura, cuenta, {
      fecha: "2031-07-11",
      importe: "500,00",
      retencion: "210,00",
    });

    expect(await cobranzaDe(factura)).toMatchObject({
      cobrado: "ARS 1.000,00",
      retenido: "ARS 210,00",
      saldo: "ARS 0,00",
      cobrada: true,
    });
  });

  test("una retención sola puede saldar el resto", async () => {
    const factura = await cargarFactura();
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
    await cobrado(factura, cuenta, { importe: "1.000,00" });

    await cobrado(factura, cuenta, { importe: "0,00", retencion: "210,00" });

    expect(await cobranzaDe(factura)).toMatchObject({
      saldo: "ARS 0,00",
      cobrada: true,
    });
  });

  test("cobrar de más se rechaza con DOM-0012 al lado del importe, y la retención cuenta para pasarse", async () => {
    const factura = await cargarFactura();
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");

    const deMas = await cobros().registrar(
      admin,
      factura,
      cobro(cuenta, { importe: "1.210,01" }),
    );
    const conRetencion = await cobros().registrar(
      admin,
      factura,
      cobro(cuenta, { importe: "1.200,00", retencion: "10,01" }),
    );

    for (const resultado of [deMas, conRetencion]) {
      expect(resultado.ok === false && resultado.errores.importe).toContain(
        `${catalogo.DOM_0012.codigo} · El importe supera lo que falta cobrar: quedan ARS 1.210,00.`,
      );
    }
    expect(await cantidadDeCobros()).toBe(0);
  });

  test("un cobro sin importe ni retención se rechaza, y lo ilegible o negativo vuelve en su campo", async () => {
    const factura = await cargarFactura();
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");

    const casos: readonly [Escrito, string, string][] = [
      [{ importe: "0,00" }, "importe", "mayor que cero"],
      [{ importe: "abc" }, "importe", "Escribí el importe"],
      [{ importe: "-5,00" }, "importe", "negativo"],
      [{ retencion: "xx" }, "retencion", "Escribí la retención"],
      [{ retencion: "-1,00" }, "retencion", "negativa"],
      [{ fecha: "2031-02-30" }, "fecha", ""],
      [{ observaciones: "x".repeat(1001) }, "observaciones", "1000"],
    ];
    for (const [cambios, campo, texto] of casos) {
      const resultado = await cobros().registrar(
        admin,
        factura,
        cobro(cuenta, cambios),
      );
      expect(resultado.ok, JSON.stringify(cambios)).toBe(false);
      expect(
        resultado.ok === false && resultado.errores[campo],
        JSON.stringify(cambios),
      ).toContain(texto);
    }
    expect(await cantidadDeCobros()).toBe(0);
  });

  test("la cuenta tiene que existir y estar activa", async () => {
    const factura = await cargarFactura();
    const inactiva = await altaDeCuenta("Caja vieja", "ARS", false);

    for (const cuentaId of [inactiva, "", "no-es-un-id"]) {
      const resultado = await cobros().registrar(
        admin,
        factura,
        cobro(cuentaId),
      );
      expect(resultado.ok === false && resultado.errores.cuentaId).toBe(
        "Elegí una cuenta activa.",
      );
    }
    expect(await cantidadDeCobros()).toBe(0);
  });

  test("una factura que no existe, o ya anulada, es DOM-0009", async () => {
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
    const anulada = await cargarFactura();
    await facturas().marcarEliminado(admin, anulada);

    for (const id of [anulada, "no-es-un-id"]) {
      await expect(
        cobros().registrar(admin, id, cobro(cuenta)),
      ).rejects.toMatchObject({ codigo: catalogo.DOM_0009.codigo });
    }
  });

  test("quien no puede escribir servicios recibe AUT-0009 y no se guarda nada", async () => {
    const factura = await cargarFactura();
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");

    await expect(
      cobros().registrar(exAdmin, factura, cobro(cuenta)),
    ).rejects.toMatchObject({ codigo: catalogo.AUT_0009.codigo });
    expect(await cantidadDeCobros()).toBe(0);
  });
});

describe("tipo de cambio", () => {
  test("un cobro en pesos de una factura en dólares pide el tipo de cambio y guarda lo que entró", async () => {
    const factura = await cargarFactura({
      importe: "100,00",
      importeMoneda: "USD",
    });
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");

    const sin = await cobros().registrar(
      admin,
      factura,
      cobro(cuenta, { importe: "50,00" }),
    );
    expect(sin.ok === false && sin.errores.tipoDeCambio).toContain(
      catalogo.DOM_0013.codigo,
    );

    await cobrado(factura, cuenta, {
      importe: "50,00",
      tipoDeCambio: "1.184,25",
      fuenteDelCambio: "Cotización de ejemplo",
    });

    const fila = await cliente().cobro.findFirstOrThrow();
    expect(fila).toMatchObject({
      importeCentavos: 5_000n,
      importeMoneda: "USD",
      entradaCentavos: 5_921_250n,
      entradaMoneda: "ARS",
      cambioNumerador: 118_425n,
      cambioDenominador: 100n,
      cambioFuente: "Cotización de ejemplo",
    });
    const cobranza = await cobranzaDe(factura);
    expect(cobranza).toMatchObject({
      total: "USD 121,00",
      cobrado: "USD 50,00",
      saldo: "USD 71,00",
    });
    expect(cobranza.cobros[0]).toMatchObject({
      importe: "USD 50,00",
      entrada: "ARS 59.212,50",
    });
    expect(cobranza.cobros[0]?.cambio).toBe("1.184,25 · Cotización de ejemplo");
  });

  test("con la cuenta de la misma moneda el tipo de cambio sobra; sin fuente o ilegible, se corrige", async () => {
    const factura = await cargarFactura();
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
    const dolares = await altaDeCuenta("Caja en dólares", "USD");

    const sobra = await cobros().registrar(
      admin,
      factura,
      cobro(cuenta, { tipoDeCambio: "1,00", fuenteDelCambio: "x" }),
    );
    const sinFuente = await cobros().registrar(
      admin,
      factura,
      cobro(dolares, { tipoDeCambio: "0,001", fuenteDelCambio: " " }),
    );
    const ilegible = await cobros().registrar(
      admin,
      factura,
      cobro(dolares, { tipoDeCambio: "abc" }),
    );

    expect(sobra.ok === false && sobra.errores.tipoDeCambio).toContain(
      catalogo.DOM_0013.codigo,
    );
    expect(sinFuente.ok === false && sinFuente.errores.fuenteDelCambio).toBe(
      "Escribí de dónde sale el tipo de cambio.",
    );
    expect(ilegible.ok === false && ilegible.errores.tipoDeCambio).toContain(
      "Escribí el tipo de cambio",
    );
    expect(await cantidadDeCobros()).toBe(0);
  });
});

describe("días desde la factura", () => {
  test("salen de la fecha del cobro menos la fecha de la factura, y no se guardan", async () => {
    const factura = await cargarFactura({ fecha: "2031-07-04" });
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
    await cobrado(factura, cuenta, { fecha: "2031-07-04", importe: "100,00" });
    await cobrado(factura, cuenta, { fecha: "2031-07-09", importe: "100,00" });
    await cobrado(factura, cuenta, { fecha: "2031-08-03", importe: "100,00" });

    const { cobros: lista } = await cobranzaDe(factura);

    expect(lista.map(({ fecha, dias }) => [fecha, dias])).toEqual([
      ["04/07/2031", "0"],
      ["09/07/2031", "5"],
      ["03/08/2031", "30"],
    ]);
  });
});

describe("anular un cobro", () => {
  test("el saldo vuelve, el cobro deja de sumar y queda en la auditoría", async () => {
    const factura = await cargarFactura();
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
    await cobrado(factura, cuenta, {
      importe: "1.000,00",
      retencion: "210,00",
    });
    expect((await cobranzaDe(factura)).cobrada).toBe(true);
    const { id } = await cliente().cobro.findFirstOrThrow();

    await cobros().marcarAnulado(admin, id);

    const cobranza = await cobranzaDe(factura);
    expect(cobranza).toMatchObject({ saldo: "ARS 1.210,00", cobrada: false });
    expect(cobranza.cobros).toEqual([]);
    const acciones = (
      await cliente().auditoria.findMany({
        where: { entidad: "Cobro", entidadId: id },
        orderBy: { en: "asc" },
      })
    ).map(({ accion }) => accion);
    expect(acciones).toEqual(["crear", "eliminar"]);
    await expect(cobros().marcarAnulado(admin, id)).rejects.toMatchObject({
      codigo: catalogo.DOM_0009.codigo,
    });
    await expect(cobros().marcarAnulado(exAdmin, id)).rejects.toMatchObject({
      codigo: catalogo.AUT_0009.codigo,
    });
  });

  test("una factura con cobros vigentes no se anula (DOM-0016); sin ellos, sí", async () => {
    const factura = await cargarFactura();
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
    await cobrado(factura, cuenta);
    const { id } = await cliente().cobro.findFirstOrThrow();

    await expect(
      facturas().marcarEliminado(admin, factura),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0016.codigo });
    expect(
      (await cliente().factura.findUniqueOrThrow({ where: { id: factura } }))
        .eliminadoEn,
    ).toBeNull();

    await cobros().marcarAnulado(admin, id);
    await facturas().marcarEliminado(admin, factura);
    expect(
      (await cliente().factura.findUniqueOrThrow({ where: { id: factura } }))
        .eliminadoEn,
    ).not.toBeNull();
  });
});

describe("mientras hay cobros vigentes (la base lo impide)", () => {
  test("la cuenta no se puede dar de baja: DOM-0010; sin cobros vigentes, sí", async () => {
    const factura = await cargarFactura();
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
    await cobrado(factura, cuenta);
    const abm = crearCasosUsoAbm(dependencias());

    await expect(
      abm.marcarEliminado(admin, CUENTAS, cuenta),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0010.codigo });

    const { id } = await cliente().cobro.findFirstOrThrow();
    await cobros().marcarAnulado(admin, id);
    await abm.marcarEliminado(admin, CUENTAS, cuenta);
    const guardada = await cliente().cuenta.findUniqueOrThrow({
      where: { id: cuenta },
    });
    expect(guardada.eliminadoEn).not.toBeNull();
  });
});

describe("dos cobros a la vez", () => {
  test("registrar un cobro toma la fila de la cuenta: una baja que llega en medio espera", async () => {
    const factura = await cargarFactura();
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
    const real = crearTransaccionalPrisma(cliente());
    const tomadas: string[] = [];
    const conEspia = crearCasosUsoCobros({
      ...dependencias(),
      transaccional: {
        ejecutar: (trabajo) =>
          real.ejecutar((repos) =>
            trabajo({
              ...repos,
              cobros: {
                ...repos.cobros,
                bloquearCuenta: (id) => {
                  tomadas.push(id);
                  return repos.cobros.bloquearCuenta(id);
                },
              },
            }),
          ),
      },
    });
    await conEspia.registrar(admin, factura, cobro(cuenta));
    expect(tomadas).toEqual([cuenta]);

    // La fila tomada hace esperar a la baja hasta que termine la transacción del cobro.
    let baja: Promise<unknown> = Promise.resolve();
    let terminoAntes = true;
    await real.ejecutar(async (repos) => {
      await repos.cobros.bloquearCuenta(cuenta);
      baja = crearCasosUsoAbm(dependencias())
        .marcarEliminado(admin, CUENTAS, cuenta)
        .then(
          () => undefined,
          () => undefined,
        );
      terminoAntes = await Promise.race([
        baja.then(() => true),
        new Promise<boolean>((resolver) => setTimeout(resolver, 400, false)),
      ]);
    });
    await baja;
    expect(terminoAntes).toBe(false);
  });

  test("cinco cobros de 400 sobre un saldo de 1.210 al mismo tiempo: se aceptan tres y el saldo nunca queda negativo", async () => {
    const factura = await cargarFactura();
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");

    const resultados = await Promise.all(
      Array.from({ length: 5 }, () =>
        cobros().registrar(admin, factura, cobro(cuenta)),
      ),
    );

    expect(resultados.filter(({ ok }) => ok)).toHaveLength(3);
    for (const resultado of resultados.filter(({ ok }) => !ok)) {
      expect(resultado.ok === false && resultado.errores.importe).toContain(
        catalogo.DOM_0012.codigo,
      );
    }
    expect(await cantidadDeCobros()).toBe(3);
    expect((await cobranzaDe(factura)).saldo).toBe("ARS 10,00");
  });

  test("un cobro y la anulación de la factura a la vez: o queda el cobro y la factura, o ninguno", async () => {
    const factura = await cargarFactura();
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");

    const [cobro1, anulacion] = await Promise.allSettled([
      cobros().registrar(admin, factura, cobro(cuenta)),
      facturas().marcarEliminado(admin, factura),
    ]);

    const anulada =
      (await cliente().factura.findUniqueOrThrow({ where: { id: factura } }))
        .eliminadoEn !== null;
    const conCobros = (await cantidadDeCobros()) > 0;
    expect(anulada && conCobros).toBe(false);
    expect(
      cobro1.status === "fulfilled" || anulacion.status === "fulfilled",
    ).toBe(true);
  });
});

describe("el avance", () => {
  test("de la orden y del servicio: total sin IVA, facturado con IVA, cobrado y pendiente, por moneda y sin convertir", async () => {
    const orden = await cargarOrden({ importe: "5.000,00" });
    const enPesos = await cargarFactura({
      numero: "A-1",
      importe: "1.000,00",
      ordenCompraId: orden,
    });
    await cargarFactura({
      numero: "A-2",
      importe: "100,00",
      importeMoneda: "USD",
      ordenCompraId: orden,
    });
    await cargarFactura({ numero: "A-3", importe: "200,00" });
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
    await cobrado(enPesos, cuenta, { importe: "400,00", retencion: "10,00" });

    const avance = await cobros().avance(servicioId);

    expect(avance.ordenes[orden]).toEqual([
      {
        moneda: "ARS",
        total: "ARS 5.000,00",
        facturado: "ARS 1.210,00",
        cobrado: "ARS 410,00",
        pendiente: "ARS 800,00",
      },
      {
        moneda: "USD",
        total: "USD 0,00",
        facturado: "USD 121,00",
        cobrado: "USD 0,00",
        pendiente: "USD 121,00",
      },
    ]);
    expect(avance.servicio).toEqual([
      {
        moneda: "ARS",
        total: "ARS 5.000,00",
        facturado: "ARS 1.452,00",
        cobrado: "ARS 410,00",
        pendiente: "ARS 1.042,00",
      },
      {
        moneda: "USD",
        total: "USD 0,00",
        facturado: "USD 121,00",
        cobrado: "USD 0,00",
        pendiente: "USD 121,00",
      },
    ]);
  });

  test("un servicio sin nada facturado no tiene avance; una factura anulada no cuenta", async () => {
    expect(await cobros().avance(servicioId)).toEqual({
      servicio: [],
      ordenes: {},
    });
    const factura = await cargarFactura();
    await facturas().marcarEliminado(admin, factura);
    expect((await cobros().avance(servicioId)).servicio).toEqual([]);
  });
});

describe("Por cobrar", () => {
  test("las facturas con saldo, por vencimiento, con sus días de atraso y el saldo por moneda", async () => {
    const otroServicio = await altaDeServicio(
      cliente(),
      dependencias(),
      admin,
      usuarios[0]?.id ?? "",
      "Otro servicio de ejemplo",
    );
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
    const futura = await cargarFactura({
      numero: "F-3",
      vencimiento: "2031-08-08",
    });
    const vencida = await cargarFactura({
      numero: "F-1",
      fecha: "2031-06-15",
      vencimiento: "2031-07-01",
    });
    const dolares = await cargarFactura(
      {
        numero: "F-2",
        importe: "100,00",
        importeMoneda: "USD",
        vencimiento: "2031-07-08",
      },
      otroServicio,
    );
    const saldada = await cargarFactura({
      numero: "F-0",
      fecha: "2031-05-01",
      vencimiento: "2031-06-01",
    });
    await cobrado(saldada, cuenta, { importe: "1.210,00" });
    await cobrado(vencida, cuenta, { importe: "210,00" });

    const lista = await cobros().porCobrar();

    expect(
      lista.filas.map(({ numero, vencimiento, saldo, atraso }) => [
        numero,
        vencimiento,
        saldo,
        atraso,
      ]),
    ).toEqual([
      ["F-1", "01/07/2031", "ARS 1.000,00", "8 días"],
      ["F-2", "08/07/2031", "USD 121,00", "1 día"],
      ["F-3", "08/08/2031", "ARS 1.210,00", ""],
    ]);
    expect(lista.filas[0]).toMatchObject({
      servicioId,
      cliente: "Minera Ejemplo S.A.",
      total: "ARS 1.210,00",
    });
    expect(lista.filas[0]?.servicio).toMatch(/^SRV-/);
    expect(lista.filas[1]?.servicioId).toBe(otroServicio);
    expect(lista.saldos).toEqual(["ARS 2.210,00", "USD 121,00"]);
    expect(futura).toBeDefined();
    expect(dolares).toBeDefined();
  });

  test("una factura saldada sale de la lista, y una anulada no entra", async () => {
    const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
    const factura = await cargarFactura();
    await cobrado(factura, cuenta, { importe: "1.210,00" });
    const anulada = await cargarFactura({ numero: "X-9" });
    await facturas().marcarEliminado(admin, anulada);

    expect(await cobros().porCobrar()).toEqual({ filas: [], saldos: [] });
  });
});

describe("el formulario de cobro", () => {
  test("trae la factura, su saldo, la fecha de hoy y solo las cuentas activas", async () => {
    const factura = await cargarFactura();
    await altaDeCuenta("Caja en pesos", "ARS");
    await altaDeCuenta("Caja vieja", "ARS", false);

    const formulario = await cobros().formulario(factura);

    expect(formulario).toMatchObject({
      numero: "0000-0001",
      saldo: "ARS 1.210,00",
      escrito: { fecha: "2031-07-09" },
    });
    expect(formulario.elegibles.cuentaId).toEqual([
      expect.objectContaining({ texto: "Caja en pesos · ARS" }),
    ]);
    expect(formulario.campos.map(([nombre]) => nombre)).toEqual([
      "fecha",
      "importe",
      "retencion",
      "cuentaId",
      "tipoDeCambio",
      "fuenteDelCambio",
      "observaciones",
    ]);
    await expect(cobros().formulario("no-es-un-id")).rejects.toMatchObject({
      codigo: catalogo.DOM_0009.codigo,
    });
  });
});
