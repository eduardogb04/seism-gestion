/**
 * F3-03 · La modalidad de facturación, la cuota mensual y sus ajustes, la
 * factura del mes y lo devengado de un servicio, contra el Postgres de verdad
 * del arnés y un almacén en disco. Lo rechazado no escribe nada.
 *
 * El reloj es siempre uno fijo (`RelojFijo`): «el mes actual» es el suyo, nunca
 * el de la máquina. Datos inventados. Necesita Docker corriendo.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
import { ResumenDeFacturacion } from "../../src/app/servicios/[id]/facturacion.tsx";
import type { Escrito } from "../../src/casos-uso/abm/definicion.ts";
import { crearCasosUsoFacturacion } from "../../src/casos-uso/servicios/facturacion.ts";
import { crearCasosUsoFacturas } from "../../src/casos-uso/servicios/facturas.ts";
import { crearCasosUsoOrdenesDeCompra } from "../../src/casos-uso/servicios/ordenes-de-compra.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  crearFechaHora,
  type FechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import {
  ESTADOS_SERVICIO,
  type EstadoServicio,
  MODALIDADES_DE_FACTURACION,
  type ModalidadDeFacturacion,
} from "../../src/dominio/servicios/estados.ts";
import { nuevaClaveDocumento } from "../../src/infraestructura/arranque/almacen.ts";
import type { AlmacenDocumentos } from "../../src/puertos/almacen-documentos.ts";
import {
  ADMIN_UNO,
  EX_ADMIN,
  sembrarUsuarios,
} from "./_arnes/administradores.ts";
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

function dia(anio: number, mes: number, numero: number): FechaHora {
  const resultado = crearFechaHora({
    anio,
    mes,
    dia: numero,
    hora: 10,
    minuto: 30,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
}

/** «Hoy» para todos los casos de uso: julio de 2031. */
const HOY = dia(2031, 7, 9);

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
const almacenes: AlmacenTemporal[] = [];
let almacen: AlmacenDocumentos;
let admin: Actor;
let exAdmin: Actor;
let servicioId: string;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function dependencias(hoy: FechaHora = HOY) {
  return {
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(hoy),
    generadorId: crearGeneradorIdCrypto(),
    almacen,
    nuevaClave: nuevaClaveDocumento,
  };
}

const facturacion = (hoy?: FechaHora) =>
  crearCasosUsoFacturacion(dependencias(hoy));
const facturas = (hoy?: FechaHora) => crearCasosUsoFacturas(dependencias(hoy));
const ordenes = () => crearCasosUsoOrdenesDeCompra(dependencias());

function llevarA(...recorrido: readonly EstadoServicio[]): Promise<void> {
  return llevarServicioA(
    dependencias().transaccional,
    admin,
    servicioId,
    recorrido,
    HOY,
  );
}

/** El resultado de una carga que tiene que pasar; si no, el test se cae con lo que faltó. */
function exigirOk<R extends { readonly ok: boolean }>(resultado: R): R {
  if (!resultado.ok) {
    throw new Error(`no pasó: ${JSON.stringify(resultado)}`);
  }
  return resultado;
}

/** Una orden de compra de 1.000,00 sin IVA: pasa el servicio de «Cotizado» a «Adjudicado». */
async function cargarOrden(moneda = "ARS"): Promise<string> {
  const resultado = await ordenes().crear(
    admin,
    servicioId,
    {
      numero: "OC-1",
      fecha: "2031-04-20",
      importe: "1.000,00",
      importeMoneda: moneda,
      observaciones: "",
    },
    null,
  );
  if (!resultado.ok) {
    throw new Error(`la orden no pasó: ${JSON.stringify(resultado)}`);
  }
  return resultado.id;
}

let facturasCargadas = 0;

/** Una factura al 21 %: de 100,00 sin IVA si no se dice otra cosa. */
async function cargarFactura(cambios: Escrito = {}, hoy?: FechaHora) {
  facturasCargadas += 1;
  return facturas(hoy).crear(
    admin,
    servicioId,
    {
      numero: `0000-${String(facturasCargadas).padStart(4, "0")}`,
      fecha: "2031-07-04",
      vencimiento: "2031-08-08",
      importe: "100,00",
      importeMoneda: "ARS",
      alicuota: "210",
      ordenCompraId: "",
      ...cambios,
    },
    null,
  );
}

async function idDeFactura(cambios: Escrito = {}, hoy?: FechaHora) {
  const resultado = await cargarFactura(cambios, hoy);
  if (!resultado.ok) {
    throw new Error(`la factura no pasó: ${JSON.stringify(resultado)}`);
  }
  return resultado.id;
}

const elegir = (modalidad: ModalidadDeFacturacion, cambios: Escrito = {}) =>
  facturacion().cambiarModalidad(admin, servicioId, { modalidad, ...cambios });

/** Mensual con una cuota de 100,00 desde mayo de 2031. */
const mensualDesdeMayo = () =>
  elegir("mensual", { cuota: "100,00", desde: "2031-05-20" });

const ajustar = (desde: string, cuota = "150,00", hoy?: FechaHora) =>
  facturacion(hoy).registrarAjuste(admin, servicioId, { cuota, desde });

async function foto() {
  const db = cliente();
  return {
    servicio: await db.servicio.findUniqueOrThrow({
      where: { id: servicioId },
    }),
    cuotas: await db.servicioCuota.findMany({ orderBy: { posicion: "asc" } }),
    facturas: await db.factura.count(),
    eventos: await db.servicioEvento.count(),
    auditoria: await db.auditoria.count(),
  };
}

/** Lo rechaza con ese código y la base queda exactamente igual. */
async function rechaza(
  codigo: string,
  trabajo: () => Promise<unknown>,
): Promise<void> {
  const antes = await foto();
  await expect(trabajo()).rejects.toMatchObject({ codigo });
  expect(await foto()).toEqual(antes);
}

const fueraDe = (admitidos: readonly EstadoServicio[]) =>
  ESTADOS_SERVICIO.filter((estado) => !admitidos.includes(estado));

async function cuotasGuardadas() {
  return (
    await cliente().servicioCuota.findMany({
      where: { eliminadoEn: null },
      orderBy: { posicion: "asc" },
    })
  ).map(({ desdeMes, importeCentavos, importeMoneda }) => [
    desdeMes.toISOString().slice(0, 10),
    importeCentavos,
    importeMoneda,
  ]);
}

/** Las líneas de la sección, una por moneda: devengado | por facturar | saldo de la orden | por cobrar. */
async function lineas(hoy?: FechaHora): Promise<string[]> {
  return (await facturacion(hoy).ver(servicioId)).lineas.map((linea) =>
    [
      linea.devengado,
      linea.porFacturar,
      linea.saldoDeOrden,
      linea.porCobrar,
    ].join(" | "),
  );
}

/** Mensual desde mayo a 100,00, con su orden de 1.000,00, y «En ejecución». */
async function mensualEnEjecucion(): Promise<void> {
  await llevarA("cotizado");
  await cargarOrden();
  exigirOk(await mensualDesdeMayo());
  await llevarA("en_ejecucion");
}

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
  const usuarios = await sembrarUsuarios(cliente(), [ADMIN_UNO, EX_ADMIN]);
  const [primero, segundo] = usuarios.map(
    ({ id }): Actor => ({ tipo: "persona", usuarioId: id }),
  );
  if (primero === undefined || segundo === undefined) {
    throw new Error("no se sembraron los usuarios");
  }
  [admin, exAdmin] = [primero, segundo];
  servicioId = await sembrarServicio(
    cliente(),
    dependencias(),
    admin,
    usuarios[0]?.id ?? "",
  );
  facturasCargadas = 0;
});

describe("elegir la modalidad", () => {
  test("se elige en «Adjudicado» y se cambia en «En ejecución»; en cualquier otra etapa, DOM-0018 sin escribir nada", async () => {
    for (const afuera of fueraDe(["adjudicado", "en_ejecucion"])) {
      await llevarA(afuera);
      await rechaza(catalogo.DOM_0018.codigo, () => elegir("puntual"));
    }
    await llevarA("adjudicado");
    exigirOk(await elegir("puntual"));
    expect((await foto()).servicio.facturacion).toBe("puntual");
    await llevarA("en_ejecucion");
    exigirOk(await elegir("por_hitos"));
    expect((await foto()).servicio.facturacion).toBe("por_hitos");
    expect(
      await cliente().auditoria.count({
        where: { entidad: "Servicio", accion: "actualizar" },
      }),
    ).toBe(2);
  });

  test("elegir la misma otra vez no escribe nada", async () => {
    await llevarA("cotizado", "adjudicado");
    exigirOk(await elegir("por_hitos"));
    const antes = await foto();
    exigirOk(await elegir("por_hitos"));
    expect(await foto()).toEqual(antes);
  });

  test("una opción que no está en la lista vuelve en el campo", async () => {
    await llevarA("cotizado", "adjudicado");
    expect(await elegir("trimestral" as ModalidadDeFacturacion)).toEqual({
      ok: false,
      errores: { modalidad: "Elegí una de las opciones de la lista." },
    });
  });

  test("mensual pide la cuota, en la moneda de la orden de compra, y el mes de inicio; guarda la cuota inicial desde el día 1 de ese mes", async () => {
    await llevarA("cotizado");
    await cargarOrden("USD");
    expect(await elegir("mensual")).toEqual({
      ok: false,
      errores: { cuota: "Escribí el importe.", desde: "Elegí una fecha." },
    });
    expect(
      await elegir("mensual", { cuota: "10,00", desde: "2031-02-30" }),
    ).toEqual({ ok: false, errores: { desde: "Esa fecha no existe." } });
    expect(
      await elegir("mensual", { cuota: "0,00", desde: "2031-02-03" }),
    ).toEqual({
      ok: false,
      errores: { cuota: "La cuota tiene que ser mayor que cero." },
    });
    expect(await cuotasGuardadas()).toEqual([]);

    exigirOk(await elegir("mensual", { cuota: "250,50", desde: "2031-05-20" }));

    expect(await cuotasGuardadas()).toEqual([["2031-05-01", 25_050n, "USD"]]);
    const { campos, escrito } =
      await facturacion().formularioDeModalidad(servicioId);
    expect(campos.find(([nombre]) => nombre === "cuota")?.[1].etiqueta).toBe(
      "Cuota mensual sin IVA (USD), solo si es mensual",
    );
    expect(escrito).toEqual({
      modalidad: "mensual",
      cuota: "250,50",
      desde: "2031-05-01",
    });
  });

  test("sin orden de compra vigente, mensual no tiene en qué moneda ir la cuota", async () => {
    await llevarA("adjudicado");
    expect(
      await elegir("mensual", { cuota: "100,00", desde: "2031-05-01" }),
    ).toEqual({
      ok: false,
      errores: {
        cuota: "Cargá antes la orden de compra: la cuota va en su moneda.",
      },
    });
  });

  test("con una factura vigente no se cambia (DOM-0019) y no se escribe nada; con la factura anulada, sí", async () => {
    await llevarA("cotizado");
    await cargarOrden();
    exigirOk(await elegir("por_hitos"));
    const factura = await idDeFactura();

    await rechaza(catalogo.DOM_0019.codigo, () => elegir("puntual"));
    await rechaza(catalogo.DOM_0019.codigo, () => mensualDesdeMayo());

    await facturas().marcarEliminado(admin, factura);
    exigirOk(await elegir("puntual"));
    expect((await foto()).servicio.facturacion).toBe("puntual");
  });

  test("cambiar de modalidad da de baja las cuotas (quedan en la base y en la auditoría); volver a mensual empieza de cero", async () => {
    await llevarA("cotizado");
    await cargarOrden();
    exigirOk(await mensualDesdeMayo());
    exigirOk(await ajustar("2031-08-01"));

    exigirOk(await elegir("por_hitos"));
    expect(await cuotasGuardadas()).toEqual([]);
    expect(await cliente().servicioCuota.count()).toBe(2);
    expect((await facturacion().ver(servicioId)).cuotas).toEqual([]);

    exigirOk(await elegir("mensual", { cuota: "80,00", desde: "2031-07-01" }));
    expect(await cuotasGuardadas()).toEqual([["2031-07-01", 8_000n, "ARS"]]);
    expect(
      await cliente().servicioCuota.findMany({
        select: { posicion: true },
        orderBy: { posicion: "asc" },
      }),
    ).toEqual([{ posicion: 0 }, { posicion: 1 }, { posicion: 2 }]);
  });

  test("quien no puede escribir servicios recibe AUT-0009 y no se escribe nada", async () => {
    await llevarA("adjudicado");
    await rechaza(catalogo.AUT_0009.codigo, () =>
      facturacion().cambiarModalidad(exAdmin, servicioId, {
        modalidad: "puntual",
      }),
    );
    await rechaza(catalogo.AUT_0009.codigo, () =>
      facturacion().registrarAjuste(exAdmin, servicioId, {
        cuota: "1,00",
        desde: "2031-07-01",
      }),
    );
  });
});

describe("ajustar la cuota mensual", () => {
  beforeEach(async () => {
    await llevarA("cotizado");
    await cargarOrden();
    exigirOk(await mensualDesdeMayo());
  });

  test("se carga con el mes desde el que rige (el día 1) y queda en el historial, con cuándo y quién", async () => {
    exigirOk(await ajustar("2031-09-17", "120,00"));

    expect(await cuotasGuardadas()).toEqual([
      ["2031-05-01", 10_000n, "ARS"],
      ["2031-09-01", 12_000n, "ARS"],
    ]);
    const { cuotas } = await facturacion().ver(servicioId);
    expect(
      cuotas.map(({ desde, importe, cuando, quien }) => [
        desde,
        importe,
        cuando,
        quien,
      ]),
    ).toEqual([
      ["mayo de 2031", "ARS 100,00", "09/07/2031 10:30", ADMIN_UNO.email],
      ["septiembre de 2031", "ARS 120,00", "09/07/2031 10:30", ADMIN_UNO.email],
    ]);
    expect(
      await cliente().auditoria.count({
        where: { entidad: "ServicioCuota", accion: "crear" },
      }),
    ).toBe(2);
  });

  test("desde un mes que ya pasó según el reloj, DOM-0020 en el caso de uso y no se escribe nada; desde el mes actual, sí", async () => {
    await rechaza(catalogo.DOM_0020.codigo, () => ajustar("2031-06-30"));
    await rechaza(catalogo.DOM_0020.codigo, () => ajustar("2030-12-01"));

    exigirOk(await ajustar("2031-07-01"));
    // Con otro reloj, julio ya pasó.
    await rechaza(catalogo.DOM_0020.codigo, () =>
      ajustar("2031-07-31", "150,00", dia(2031, 8, 1)),
    );
  });

  test("desde antes del mes de inicio, DOM-0020 aunque no haya pasado", async () => {
    exigirOk(await elegir("mensual", { cuota: "100,00", desde: "2031-10-03" }));
    await rechaza(catalogo.DOM_0020.codigo, () => ajustar("2031-09-01"));
    exigirOk(await ajustar("2031-10-01"));
  });

  test("lo que la persona corrige vuelve por campo", async () => {
    expect(await ajustar("", "")).toEqual({
      ok: false,
      errores: { cuota: "Escribí el importe.", desde: "Elegí una fecha." },
    });
    expect(await ajustar("2031-08-01", "-5,00")).toEqual({
      ok: false,
      errores: { cuota: "La cuota tiene que ser mayor que cero." },
    });
  });

  test("solo en mensual (DOM-0022) y solo en «Adjudicado» y «En ejecución» (DOM-0018), sin escribir nada", async () => {
    await llevarA("en_ejecucion");
    exigirOk(await ajustar("2031-08-01"));
    await llevarA("finalizado");
    await rechaza(catalogo.DOM_0018.codigo, () => ajustar("2031-09-01"));

    await llevarA("en_ejecucion");
    exigirOk(await elegir("por_hitos"));
    await rechaza(catalogo.DOM_0022.codigo, () => ajustar("2031-09-01"));
  });

  test("el formulario propone el mes del reloj", async () => {
    expect(
      (await facturacion().formularioDeAjuste(servicioId)).escrito,
    ).toEqual({ desde: "2031-07-01" });
  });
});

describe("lo devengado, a la fecha del reloj", () => {
  test("mensual: la cuota de cada mes desde el inicio hasta el del reloj; un ajuste no cambia los meses de antes; dos del mismo mes, vale el último", async () => {
    await mensualEnEjecucion();
    // Mayo, junio y julio a 100,00: 300,00; sin facturas, todo por facturar.
    expect(await lineas()).toEqual([
      "ARS 300,00 | ARS 300,00 | ARS 1.000,00 | ARS 0,00",
    ]);
    exigirOk(await ajustar("2031-08-01", "200,00"));
    exigirOk(await ajustar("2031-08-01", "150,00"));
    expect(await lineas()).toEqual([
      "ARS 300,00 | ARS 300,00 | ARS 1.000,00 | ARS 0,00",
    ]);
    // Agosto y septiembre a 150,00 (el último cargado de agosto).
    expect(await lineas(dia(2031, 9, 30))).toEqual([
      "ARS 600,00 | ARS 600,00 | ARS 1.000,00 | ARS 0,00",
    ]);
    // Con tope en el total de la orden.
    expect(await lineas(dia(2032, 12, 1))).toEqual([
      "ARS 1.000,00 | ARS 1.000,00 | ARS 1.000,00 | ARS 0,00",
    ]);
  }, 20_000);

  test("con facturas: el por facturar es devengado menos facturado (sin IVA); el saldo de la orden es el de F2-06 y el por cobrar, el de F2-07", async () => {
    await mensualEnEjecucion();
    await idDeFactura({ periodo: "2031-05-01", importe: "100,00" });
    await idDeFactura({ periodo: "2031-06-01", importe: "300,00" });

    // Devengado 300,00, facturado 400,00 sin IVA: se facturó de más.
    expect(await lineas()).toEqual([
      "ARS 300,00 | ARS -100,00 | ARS 600,00 | ARS 484,00",
    ]);
  });

  test("lo que se ve en la sección: la modalidad y las cifras de cada moneda", async () => {
    await mensualEnEjecucion();
    const html = renderToStaticMarkup(
      createElement(ResumenDeFacturacion, {
        facturacion: await facturacion().ver(servicioId),
      }),
    );
    const texto = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(texto).toContain("Modalidad: Mensual");
    expect(texto).toContain(
      "Moneda Devengado a julio de 2031 Por facturar Saldo de la orden de compra Por cobrar (con IVA)",
    );
    expect(texto).toContain("ARS ARS 300,00 ARS 300,00 ARS 1.000,00 ARS 0,00");
    expect(texto).toContain("mayo de 2031 ARS 100,00");
  });

  test("puntual: nada hasta «Finalizado», después el total de la orden", async () => {
    await llevarA("cotizado");
    await cargarOrden();
    exigirOk(await elegir("puntual"));
    await llevarA("en_ejecucion");
    expect(await lineas()).toEqual([
      "ARS 0,00 | ARS 0,00 | ARS 1.000,00 | ARS 0,00",
    ]);

    await llevarA("finalizado");
    await idDeFactura({ importe: "400,00" });
    expect(await lineas()).toEqual([
      "ARS 1.000,00 | ARS 600,00 | ARS 600,00 | ARS 484,00",
    ]);
  });

  test("por hitos: lo devengado es lo facturado y el por facturar es el saldo de la orden", async () => {
    await llevarA("cotizado");
    await cargarOrden();
    exigirOk(await elegir("por_hitos"));
    await idDeFactura({ importe: "250,00" });

    expect(await lineas()).toEqual([
      "ARS 250,00 | ARS 750,00 | ARS 750,00 | ARS 302,50",
    ]);
    const { lineas: [linea] = [] } = await facturacion().ver(servicioId);
    expect(linea?.devengado).toBe("ARS 250,00");
  });

  test("sin modalidad, nada devengado", async () => {
    await llevarA("cotizado");
    await cargarOrden();
    expect((await facturacion().ver(servicioId)).modalidad).toBeNull();
    expect(await lineas()).toEqual([
      "ARS 0,00 | ARS 0,00 | ARS 1.000,00 | ARS 0,00",
    ]);
  });
});

describe("facturar", () => {
  test("sin modalidad, DOM-0021 en cualquier etapa y no se escribe nada", async () => {
    for (const estado of ESTADOS_SERVICIO) {
      await llevarA(estado);
      await rechaza(catalogo.DOM_0021.codigo, () => cargarFactura());
    }
  });

  const ETAPAS: Readonly<
    Record<ModalidadDeFacturacion, readonly EstadoServicio[]>
  > = {
    puntual: ["finalizado"],
    por_hitos: ["adjudicado", "en_ejecucion", "finalizado"],
    mensual: ["en_ejecucion", "finalizado"],
  };

  test.each(MODALIDADES_DE_FACTURACION.map((modalidad) => [modalidad]))(
    "%s: se factura en sus etapas; en cada una de las demás, DOM-0018 sin escribir nada",
    async (modalidad) => {
      await conModalidad(cliente(), servicioId, modalidad);
      const periodo = modalidad === "mensual" ? { periodo: "2031-07-01" } : {};
      for (const adentro of ETAPAS[modalidad]) {
        await llevarA(adentro);
        await idDeFactura(periodo);
      }
      for (const afuera of fueraDe(ETAPAS[modalidad])) {
        await llevarA(afuera);
        await rechaza(catalogo.DOM_0018.codigo, () => cargarFactura(periodo));
      }
    },
    20_000,
  );
});

describe("la factura del mes", () => {
  beforeEach(mensualEnEjecucion);

  test("propone el período más antiguo sin factura, desde el inicio hasta el mes del reloj, y la cuota de ese mes", async () => {
    exigirOk(await ajustar("2031-07-01", "130,00"));
    const propuesta = async (hoy?: FechaHora) => {
      const { escrito } = await facturas(hoy).formulario(servicioId);
      return [escrito.periodo, escrito.importe, escrito.importeMoneda];
    };
    expect(await propuesta()).toEqual(["2031-05-01", "100,00", "ARS"]);

    await idDeFactura({ periodo: "2031-05-15" });
    await idDeFactura({ periodo: "2031-06-01" });
    expect(await propuesta()).toEqual(["2031-07-01", "130,00", "ARS"]);

    await idDeFactura({ periodo: "2031-07-01" });
    // Todos facturados: el mes del reloj.
    expect(await propuesta()).toEqual(["2031-07-01", "130,00", "ARS"]);
    expect(await propuesta(dia(2031, 8, 2))).toEqual([
      "2031-08-01",
      "130,00",
      "ARS",
    ]);
  });

  test("se carga como cualquier factura y con el importe editado: se guarda lo escrito, no la cuota", async () => {
    const id = await idDeFactura({ periodo: "2031-05-20", importe: "87,25" });

    const guardada = await cliente().factura.findUniqueOrThrow({
      where: { id },
    });
    expect(guardada.importeCentavos).toBe(8_725n);
    expect(guardada.periodo?.toISOString().slice(0, 10)).toBe("2031-05-01");
    const [listada] = await facturas().listar(servicioId);
    expect(listada?.periodo).toBe("mayo de 2031");
  });

  test("en mensual el período es obligatorio", async () => {
    expect(await cargarFactura({ periodo: "" })).toEqual({
      ok: false,
      errores: { periodo: "Elegí una fecha." },
    });
    expect(await cliente().factura.count()).toBe(0);
  });

  test("en otra modalidad no hay período: no se pide ni se guarda", async () => {
    exigirOk(await elegir("por_hitos"));
    const { campos, escrito } = await facturas().formulario(servicioId);
    expect(campos.map(([nombre]) => nombre)).not.toContain("periodo");
    expect(escrito.periodo).toBeUndefined();

    const id = await idDeFactura({ periodo: "2031-05-01" });
    expect(
      (await cliente().factura.findUniqueOrThrow({ where: { id } })).periodo,
    ).toBeNull();
    const [listada] = await facturas().listar(servicioId);
    expect(listada?.periodo).toBe("");
  });
});

test("anular la orden de compra vuelve el servicio a «Cotizado» en la misma transacción; la modalidad y las cuotas quedan", async () => {
  await llevarA("cotizado");
  const orden = await cargarOrden();
  exigirOk(await mensualDesdeMayo());

  await ordenes().marcarEliminado(admin, orden);

  const eventos = await cliente().servicioEvento.findMany({
    where: { servicioId },
    orderBy: { posicion: "asc" },
  });
  expect(eventos.slice(-2).map(({ de, a, nota }) => ({ de, a, nota }))).toEqual(
    [
      {
        de: "cotizado",
        a: "adjudicado",
        nota: "Orden de compra OC-1 cargada",
      },
      { de: "adjudicado", a: "cotizado", nota: "Orden de compra OC-1 anulada" },
    ],
  );
  expect((await foto()).servicio.facturacion).toBe("mensual");
  expect(await cuotasGuardadas()).toEqual([["2031-05-01", 10_000n, "ARS"]]);
});
