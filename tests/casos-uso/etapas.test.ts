/**
 * F3-01 · Cada etapa limita lo que se carga, en el caso de uso (R6), y el
 * cierre automático de un servicio finalizado (R5), contra el Postgres de
 * verdad del arnés y un almacén en disco. Fuera de etapa es `DOM-0018` y no se
 * escribe nada: ni filas, ni auditoría, ni eventos, ni archivos.
 *
 * Los servicios se llevan a cada etapa escribiendo sus eventos a mano
 * (`llevarServicioA`). Datos inventados. Necesita Docker corriendo.
 */

import { readdir } from "node:fs/promises";
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
import { crearCasosUsoCotizaciones } from "../../src/casos-uso/servicios/cotizaciones.ts";
import { crearCasosUsoFacturas } from "../../src/casos-uso/servicios/facturas.ts";
import { crearCasosUsoOrdenesDeCompra } from "../../src/casos-uso/servicios/ordenes-de-compra.ts";
import { crearCasosUsoServicios } from "../../src/casos-uso/servicios/servicios.ts";
import { crearCasosUsoSucesos } from "../../src/casos-uso/servicios/sucesos.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import {
  ESTADOS_SERVICIO,
  type EstadoServicio,
} from "../../src/dominio/servicios/estados.ts";
import { nuevaClaveDocumento } from "../../src/infraestructura/arranque/almacen.ts";
import type { AlmacenDocumentos } from "../../src/puertos/almacen-documentos.ts";
import type { Transaccional } from "../../src/puertos/repositorios/transaccion.ts";
import { ADMIN_UNO, sembrarUsuarios } from "./_arnes/administradores.ts";
import {
  type AlmacenTemporal,
  crearAlmacenTemporal,
} from "./_arnes/almacen-temporal.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import {
  conModalidad,
  llevarServicioA,
  sembrarServicio,
} from "./_arnes/servicio.ts";

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

const PDF = new TextEncoder().encode("%PDF-1.4\nDocumento de ejemplo\n");

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
const almacenes: AlmacenTemporal[] = [];
let almacen: AlmacenDocumentos;
let carpeta = "";
let admin: Actor;
let servicioId: string;
let cuentaId: string;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function dependencias(transaccional?: Transaccional) {
  return {
    transaccional: transaccional ?? crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(HOY),
    generadorId: crearGeneradorIdCrypto(),
  };
}

function conAlmacen() {
  return { ...dependencias(), almacen, nuevaClave: nuevaClaveDocumento };
}

const servicios = () => crearCasosUsoServicios(dependencias());
const cotizaciones = () => crearCasosUsoCotizaciones(conAlmacen());
const ordenes = () => crearCasosUsoOrdenesDeCompra(conAlmacen());
const facturas = () => crearCasosUsoFacturas(conAlmacen());
const cobros = (transaccional?: Transaccional) =>
  crearCasosUsoCobros(dependencias(transaccional));
const sucesos = () => crearCasosUsoSucesos(dependencias());

function llevarA(...recorrido: readonly EstadoServicio[]): Promise<void> {
  return llevarServicioA(
    dependencias().transaccional,
    admin,
    servicioId,
    recorrido,
    HOY,
  );
}

async function estado(): Promise<string | undefined> {
  const [ultimo] = await cliente().servicioEvento.findMany({
    where: { servicioId },
    orderBy: { posicion: "desc" },
    take: 1,
  });
  return ultimo?.a;
}

/** El resultado de una carga que tiene que pasar; si no, el test se cae con lo que faltó. */
function exigirOk<R extends { readonly ok: boolean }>(
  resultado: R,
): Extract<R, { readonly ok: true }> {
  const paso = (r: R): r is Extract<R, { readonly ok: true }> => r.ok;
  if (!paso(resultado)) {
    throw new Error(`no pasó: ${JSON.stringify(resultado)}`);
  }
  return resultado;
}

const cargarCotizacion = async () =>
  exigirOk(
    await cotizaciones().crear(
      admin,
      servicioId,
      {
        fecha: "2031-07-08",
        importe: "12.500,00",
        importeMoneda: "ARS",
        observaciones: "",
        motivo: "Revisión",
      },
      { nombre: "cotizacion.pdf", bytes: PDF },
    ),
  );

const cargarOrden = async (numero = "OC-1") =>
  exigirOk(
    await ordenes().crear(
      admin,
      servicioId,
      {
        numero,
        fecha: "2031-07-01",
        importe: "1.000,00",
        importeMoneda: "ARS",
        observaciones: "",
      },
      { nombre: "orden.pdf", bytes: PDF },
    ),
  );

let facturasCargadas = 0;

/** Una factura de 1.000,00 sin IVA al 21 %: total con IVA 1.210,00. */
const cargarFactura = async () => {
  facturasCargadas += 1;
  return exigirOk(
    await facturas().crear(
      admin,
      servicioId,
      {
        numero: `0000-${String(facturasCargadas).padStart(4, "0")}`,
        fecha: "2031-07-04",
        vencimiento: "2031-08-08",
        importe: "1.000,00",
        importeMoneda: "ARS",
        alicuota: "210",
        ordenCompraId: "",
      },
      { nombre: "factura.pdf", bytes: PDF },
    ),
  );
};

function escritoDeCobro(cambios: Escrito = {}): Escrito {
  return {
    fecha: "2031-07-09",
    importe: "1,00",
    retencion: "",
    cuentaId,
    tipoDeCambio: "",
    fuenteDelCambio: "",
    observaciones: "",
    ...cambios,
  };
}

const cobrar = async (facturaId: string, cambios: Escrito = {}) =>
  exigirOk(await cobros().registrar(admin, facturaId, escritoDeCobro(cambios)));

const cargarSuceso = async () =>
  exigirOk(
    await sucesos().crear(admin, servicioId, {
      fecha: "2031-07-09",
      texto: "Llamó el cliente",
    }),
  );

async function archivos(): Promise<number> {
  return (
    await readdir(carpeta, { recursive: true, withFileTypes: true })
  ).filter((entrada) => entrada.isFile()).length;
}

async function foto() {
  const db = cliente();
  return {
    cotizaciones: await db.cotizacion.count({ where: { eliminadoEn: null } }),
    ordenes: await db.ordenCompra.count({ where: { eliminadoEn: null } }),
    facturas: await db.factura.count({ where: { eliminadoEn: null } }),
    cobros: await db.cobro.count({ where: { eliminadoEn: null } }),
    sucesos: await db.servicioSuceso.count({ where: { eliminadoEn: null } }),
    documentos: await db.documento.count(),
    eventos: await db.servicioEvento.count(),
    auditoria: await db.auditoria.count(),
    archivos: await archivos(),
  };
}

/** Lo rechaza con `DOM-0018` y la base y el almacén quedan exactamente igual. */
async function fueraDeEtapa(trabajo: () => Promise<unknown>): Promise<void> {
  const antes = await foto();
  await expect(trabajo()).rejects.toMatchObject({
    codigo: catalogo.DOM_0018.codigo,
  });
  expect(await foto()).toEqual(antes);
}

const fueraDe = (admitidos: readonly EstadoServicio[]) =>
  ESTADOS_SERVICIO.filter((estado) => !admitidos.includes(estado));

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
  ({ almacen, carpeta } = temporal);
  const [usuario] = await sembrarUsuarios(cliente(), [ADMIN_UNO]);
  if (usuario === undefined) {
    throw new Error("no se sembró el usuario");
  }
  admin = { tipo: "persona", usuarioId: usuario.id };
  servicioId = await sembrarServicio(
    cliente(),
    dependencias(),
    admin,
    usuario.id,
  );
  // Factura sin probar la modalidad (F3-03): «Por hitos», en las mismas etapas que antes.
  await conModalidad(cliente(), servicioId);
  const cuenta = await crearCasosUsoAbm(dependencias()).crear(admin, CUENTAS, {
    nombre: "Caja de ejemplo",
    tipo: "banco",
    moneda: "ARS",
    observaciones: "",
    activa: "si",
  });
  if (!cuenta.ok) {
    throw new Error("no se pudo dar de alta la cuenta");
  }
  cuentaId = cuenta.registro.valor.id;
  facturasCargadas = 0;
});

describe("cada etapa limita lo que se carga (R6)", () => {
  test("cotizaciones: entran en «Creado» y en «Cotizado»; en cualquier otra, DOM-0018 sin escribir nada, tampoco el archivo", async () => {
    await cargarCotizacion();
    expect(await estado()).toBe("cotizado");
    await cargarCotizacion();

    for (const afuera of fueraDe(["creado", "cotizado"])) {
      await llevarA(afuera);
      await fueraDeEtapa(cargarCotizacion);
    }
  });

  test("anular una cotización sigue la misma regla: en «Cotizado» sí, en «Adjudicado» DOM-0018", async () => {
    const { id } = await cargarCotizacion();
    const otra = await cargarCotizacion();
    await cotizaciones().marcarEliminado(admin, otra.id);

    await llevarA("adjudicado");
    await fueraDeEtapa(() => cotizaciones().marcarEliminado(admin, id));
  });

  test("la orden de compra: entra en «Cotizado»; en cualquier otra, DOM-0018 sin escribir nada", async () => {
    for (const afuera of fueraDe(["cotizado"])) {
      await llevarA(afuera);
      await fueraDeEtapa(() => cargarOrden());
    }
    await llevarA("cotizado");
    await cargarOrden();
    expect(await estado()).toBe("adjudicado");
  });

  test("anular la orden de compra: en «Adjudicado» sí; en «En ejecución», DOM-0018", async () => {
    await llevarA("cotizado");
    const { id } = await cargarOrden("OC-1");
    await llevarA("cotizado");
    const otra = await cargarOrden("OC-2");
    await ordenes().marcarEliminado(admin, otra.id);

    await llevarA("en_ejecucion");
    await fueraDeEtapa(() => ordenes().marcarEliminado(admin, id));
  });

  test("facturas: entran de «Adjudicado» a «Finalizado»; en cualquier otra, DOM-0018 sin escribir nada", async () => {
    for (const adentro of [
      "adjudicado",
      "en_ejecucion",
      "finalizado",
    ] as const) {
      await llevarA(adentro);
      await cargarFactura();
    }
    for (const afuera of fueraDe([
      "adjudicado",
      "en_ejecucion",
      "finalizado",
    ])) {
      await llevarA(afuera);
      await fueraDeEtapa(cargarFactura);
    }
  });

  test("anular una factura sigue la misma regla: en «En ejecución» sí, cancelado el servicio DOM-0018", async () => {
    await llevarA("en_ejecucion");
    const { id } = await cargarFactura();
    const otra = await cargarFactura();
    await facturas().marcarEliminado(admin, otra.id);

    await llevarA("cancelado");
    await fueraDeEtapa(() => facturas().marcarEliminado(admin, id));
  });

  test("cobros: en cualquier etapa menos «Cerrado», mientras la factura tenga saldo", async () => {
    await llevarA("adjudicado");
    const { id } = await cargarFactura();

    for (const adentro of fueraDe(["cerrado"])) {
      await llevarA(adentro);
      await cobrar(id);
    }
    await llevarA("cerrado");
    await fueraDeEtapa(() => cobros().registrar(admin, id, escritoDeCobro()));
  });

  test("anular un cobro: antes de «Cerrado» sí; en «Cerrado», DOM-0018", async () => {
    await llevarA("en_ejecucion");
    const { id } = await cargarFactura();
    await cobrar(id);
    await cobrar(id);
    const [primero, segundo] = await cliente().cobro.findMany({
      orderBy: { creadoEn: "asc" },
    });
    await cobros().marcarAnulado(admin, primero?.id ?? "");

    await llevarA("cerrado");
    await fueraDeEtapa(() => cobros().marcarAnulado(admin, segundo?.id ?? ""));
  });

  test("sucesos: en cualquier etapa menos «Cerrado», también perdido, sin respuesta y cancelado", async () => {
    for (const adentro of fueraDe(["cerrado"])) {
      await llevarA(adentro);
      await cargarSuceso();
    }
    expect(await cliente().servicioSuceso.count()).toBe(8);

    await llevarA("cerrado");
    await fueraDeEtapa(cargarSuceso);
  });

  test("anular un suceso: antes de «Cerrado» sí; en «Cerrado», DOM-0018", async () => {
    await cargarSuceso();
    await cargarSuceso();
    const [uno, otro] = await sucesos().listar(servicioId);
    exigirOk(
      await sucesos().marcarAnulado(admin, uno?.id ?? "", {
        motivo: "Repetido",
      }),
    );

    await llevarA("cerrado");
    await fueraDeEtapa(() =>
      sucesos().marcarAnulado(admin, otro?.id ?? "", { motivo: "Repetido" }),
    );
  });
});

describe("el cierre automático (R5)", () => {
  async function eventos() {
    return (
      await cliente().servicioEvento.findMany({
        where: { servicioId },
        orderBy: { posicion: "asc" },
      })
    ).map(({ de, a, nota }) => ({ de, a, nota }));
  }

  test("el cobro que salda la última factura de un servicio finalizado lo pasa a «Cerrado»; la retención cancela deuda", async () => {
    await llevarA("adjudicado");
    const primera = await cargarFactura();
    const segunda = await cargarFactura();
    await cobrar(primera.id, { importe: "1.210,00" });
    await llevarA("en_ejecucion", "finalizado");

    await cobrar(segunda.id, { importe: "1.000,00", retencion: "210,00" });

    expect(await estado()).toBe("cerrado");
    expect((await eventos()).at(-1)).toEqual({
      de: "finalizado",
      a: "cerrado",
      nota: "Se cobró todo lo facturado",
    });
  });

  test("al «Finalizar servicio» con todo ya cobrado, pasa a «Finalizado» y enseguida a «Cerrado»", async () => {
    await llevarA("adjudicado", "en_ejecucion");
    const { id } = await cargarFactura();
    await cobrar(id, { importe: "1.210,00" });
    expect(await estado()).toBe("en_ejecucion");

    await servicios().cambiarEstado(admin, servicioId, "finalizado", "");

    expect((await eventos()).slice(-2)).toEqual([
      { de: "en_ejecucion", a: "finalizado", nota: null },
      { de: "finalizado", a: "cerrado", nota: "Se cobró todo lo facturado" },
    ]);
  });

  test("si a una factura le falta un centavo no se cierra, por ningún camino", async () => {
    await llevarA("adjudicado", "en_ejecucion");
    const { id } = await cargarFactura();
    const otra = await cargarFactura();
    await cobrar(id, { importe: "1.210,00" });
    await cobrar(otra.id, { importe: "1.209,98" });

    await servicios().cambiarEstado(admin, servicioId, "finalizado", "");
    expect(await estado()).toBe("finalizado");

    await cobrar(otra.id, { importe: "0,01" });
    expect(await estado()).toBe("finalizado");

    await cobrar(otra.id, { importe: "0,01" });
    expect(await estado()).toBe("cerrado");
  });

  test("sin facturas no se cierra nunca", async () => {
    await llevarA("adjudicado", "en_ejecucion");

    await servicios().cambiarEstado(admin, servicioId, "finalizado", "");

    expect(await estado()).toBe("finalizado");
  });

  test("todo cobrado pero «En ejecución»: no se cierra hasta finalizar", async () => {
    await llevarA("adjudicado", "en_ejecucion");
    const { id } = await cargarFactura();

    await cobrar(id, { importe: "1.210,00" });

    expect(await estado()).toBe("en_ejecucion");
  });

  test("el cierre va en la misma transacción que el cobro: si falla después, no queda ni el cobro ni el cambio de estado", async () => {
    await llevarA("adjudicado");
    const { id } = await cargarFactura();
    await llevarA("en_ejecucion", "finalizado");
    const real = crearTransaccionalPrisma(cliente());
    const fallida: Transaccional = {
      ejecutar: (trabajo) =>
        real.ejecutar(async (repos) => {
          await trabajo(repos);
          expect(
            (await repos.servicios.eventosDe(servicioId)).at(-1)?.a,
            "adentro de la transacción ya se cerró",
          ).toBe("cerrado");
          throw new Error("falla de prueba");
        }),
    };
    const antes = await foto();

    await expect(
      cobros(fallida).registrar(
        admin,
        id,
        escritoDeCobro({ importe: "1.210,00" }),
      ),
    ).rejects.toThrow("falla de prueba");

    expect(await foto()).toEqual(antes);
    expect(await estado()).toBe("finalizado");
  });
});
