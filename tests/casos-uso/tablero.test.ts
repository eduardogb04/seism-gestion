/**
 * El tablero de inicio (F2-10, ADR 0038) contra el Postgres de verdad del
 * arnés, sobre una base sembrada con totales conocidos: dos monedas, registros
 * anulados, registros del mes anterior y del siguiente (y en los bordes del
 * mes), facturas con medio centavo de IVA, un egreso de cada clase, un cobro
 * con retención y saldos vencidos y no vencidos. Cada número se compara con su
 * valor escrito acá y con la suma del listado al que lleva. Datos inventados.
 * Necesita Docker.
 *
 * Reloj fijo: 09/07/2031. Servicio A = SRV-2031-001, servicio B = SRV-2031-002.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { crearGeneradorIdCrypto } from "../../src/adaptadores/memoria/generador-id.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearTransaccionalPrisma } from "../../src/adaptadores/prisma/transaccion.ts";
import { TableroDeInicio } from "../../src/app/_ui/tablero-de-inicio.tsx";
import { crearCasosUsoAbm } from "../../src/casos-uso/abm/abm.ts";
import { EGRESOS } from "../../src/casos-uso/abm/egresos.ts";
import { crearCasosUsoPagos } from "../../src/casos-uso/egresos/pagos.ts";
import { crearCasosUsoCobros } from "../../src/casos-uso/servicios/cobros.ts";
import { crearCasosUsoEgresosDeServicio } from "../../src/casos-uso/servicios/egresos.ts";
import { crearCasosUsoFacturas } from "../../src/casos-uso/servicios/facturas.ts";
import { crearCasosUsoTablero } from "../../src/casos-uso/tablero/tablero.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import {
  crearImporte,
  formatearImporte,
  type Importe,
  MONEDAS,
  type Moneda,
  parsearImporte,
} from "../../src/dominio/compartido/importe.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { nuevaClaveDocumento } from "../../src/infraestructura/arranque/almacen.ts";
import type { AlmacenDocumentos } from "../../src/puertos/almacen-documentos.ts";
import { ADMIN_UNO, sembrarUsuarios } from "./_arnes/administradores.ts";
import {
  type AlmacenTemporal,
  crearAlmacenTemporal,
} from "./_arnes/almacen-temporal.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import {
  altaDeServicio,
  llevarServicioA,
  sembrarServicio,
} from "./_arnes/servicio.ts";
import { ayudasDelTablero } from "./_arnes/tablero.ts";

function fecha(anio: number, mes: number, dia: number) {
  const resultado = crearFechaHora({
    anio,
    mes,
    dia,
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

const HOY = fecha(2031, 7, 9);

const prisma = {
  actual: undefined as ReturnType<typeof crearClientePrisma> | undefined,
};
let almacenTemporal: AlmacenTemporal;
let admin: Actor;
let centros: { obra: string; oficina: string; inversion: string };

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma.actual, "el cliente de Prisma no se armó").toBeDefined();
  return prisma.actual as ReturnType<typeof crearClientePrisma>;
}

function dependencias(reloj = RelojFijo(HOY)) {
  return {
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj,
    generadorId: crearGeneradorIdCrypto(),
  };
}

const tablero = (reloj = RelojFijo(HOY)) =>
  crearCasosUsoTablero(dependencias(reloj));
const abm = () => crearCasosUsoAbm(dependencias());
const cobros = (almacen: AlmacenDocumentos) =>
  crearCasosUsoCobros({
    ...dependencias(),
    almacen,
    nuevaClave: nuevaClaveDocumento,
  });
const pagos = () => crearCasosUsoPagos(dependencias());
const facturas = (almacen: AlmacenDocumentos) =>
  crearCasosUsoFacturas({
    ...dependencias(),
    almacen,
    nuevaClave: nuevaClaveDocumento,
  });

const {
  altaDeCentro,
  altaDeCuenta,
  cargarFactura,
  cobrar,
  cargarEgreso,
  pagar,
} = ayudasDelTablero({
  dependencias: () => dependencias(),
  admin: () => admin,
  almacen: () => almacenTemporal.almacen,
});

let servicioA = "";
let servicioB = "";

beforeAll(async () => {
  prisma.actual = crearClientePrisma(uriBaseCompartida());
  await limpiarBase();
  almacenTemporal = await crearAlmacenTemporal();
  const usuarios = await sembrarUsuarios(cliente(), [ADMIN_UNO]);
  const primero = usuarios[0];
  if (primero === undefined) {
    throw new Error("no se sembró el usuario");
  }
  admin = { tipo: "persona", usuarioId: primero.id };
  servicioA = await sembrarServicio(
    cliente(),
    dependencias(),
    admin,
    primero.id,
  );
  servicioB = await altaDeServicio(
    cliente(),
    dependencias(),
    admin,
    primero.id,
    "Servicio B de ejemplo",
  );
  // Las facturas entran «En ejecución» (F3-01): los dos se llevan ahí a mano.
  for (const id of [servicioA, servicioB]) {
    await llevarServicioA(
      dependencias().transaccional,
      admin,
      id,
      ["cotizado", "adjudicado", "en_ejecucion"],
      HOY,
    );
  }
  centros = {
    obra: await altaDeCentro("Obra de ejemplo", "proyecto"),
    oficina: await altaDeCentro("Oficina de ejemplo", "gestion_administrativa"),
    inversion: await altaDeCentro(
      "Inversión de ejemplo",
      "fuera_de_rentabilidad",
    ),
  };
  const pesos = await altaDeCuenta("Caja en pesos", "ARS");
  const dolares = await altaDeCuenta("Caja en dólares", "USD");

  // Facturas. Junio y agosto no suman en julio; la anulada no suma nunca.
  const f0 = await cargarFactura(servicioA, {
    numero: "F-0001",
    fecha: "2031-06-10",
    vencimiento: "2031-06-30",
    importe: "500,00",
    alicuota: "0",
  });
  const f1 = await cargarFactura(servicioA, {
    numero: "F-0002",
    fecha: "2031-07-04",
    vencimiento: "2031-07-08",
    importe: "1.000,00",
  });
  await cargarFactura(servicioA, {
    numero: "F-0003",
    fecha: "2031-07-05",
    vencimiento: "2031-08-10",
    importe: "0,50",
  });
  await cargarFactura(servicioA, {
    numero: "F-0004",
    fecha: "2031-07-06",
    vencimiento: "2031-08-10",
    importe: "0,50",
  });
  await cargarFactura(servicioB, {
    numero: "F-0005",
    fecha: "2031-07-07",
    vencimiento: "2031-08-10",
    importe: "0,50",
  });
  const f5 = await cargarFactura(servicioB, {
    numero: "F-0006",
    fecha: "2031-07-31",
    vencimiento: "2031-08-30",
    importe: "2.000,00",
    alicuota: "105",
  });
  await cargarFactura(servicioA, {
    numero: "F-0007",
    fecha: "2031-08-01",
    vencimiento: "2031-09-01",
    importe: "700,00",
    alicuota: "0",
  });
  const anulada = await cargarFactura(servicioB, {
    numero: "F-0008",
    fecha: "2031-07-20",
    vencimiento: "2031-08-20",
    importe: "9.999,00",
  });
  await facturas(almacenTemporal.almacen).marcarEliminado(admin, anulada);
  const u1 = await cargarFactura(servicioA, {
    numero: "F-0009",
    fecha: "2031-07-15",
    vencimiento: "2031-07-20",
    importe: "1.000,00",
    moneda: "USD",
  });
  await cargarFactura(servicioA, {
    numero: "F-0010",
    fecha: "2031-07-02",
    vencimiento: "2031-07-08",
    importe: "100,00",
    moneda: "USD",
    alicuota: "0",
  });

  // Cobros.
  await cobrar(f0, pesos, "2031-06-15", "100,00");
  await cobrar(f1, pesos, "2031-07-09", "400,00", "21,00");
  await cobrar(f1, pesos, "2031-08-01", "50,00");
  await cobrar(f5, pesos, "2031-07-31", "1.000,00");
  await cobrar(u1, dolares, "2031-07-16", "300,00");
  await cobrar(f1, pesos, "2031-07-09", "77,00");
  const anulado = await cliente().cobro.findFirstOrThrow({
    where: { importeCentavos: 7_700n },
  });
  await cobros(almacenTemporal.almacen).marcarAnulado(admin, anulado.id);

  // Egresos.
  const e1 = await cargarEgreso({
    centroCostoId: centros.obra,
    fecha: "2031-07-02",
    importe: "600,00",
    vencimiento: "2031-07-05",
    servicioId: servicioA,
  });
  await cargarEgreso({
    centroCostoId: centros.obra,
    fecha: "2031-07-31",
    importe: "250,00",
    servicioId: servicioB,
  });
  const e3 = await cargarEgreso({
    centroCostoId: centros.oficina,
    fecha: "2031-07-10",
    importe: "300,00",
    vencimiento: "2031-08-10",
  });
  await cargarEgreso({
    centroCostoId: centros.inversion,
    fecha: "2031-07-01",
    importe: "1.000,00",
  });
  const e5 = await cargarEgreso({
    centroCostoId: centros.obra,
    fecha: "2031-06-30",
    importe: "40,00",
    servicioId: servicioA,
  });
  const e6 = await cargarEgreso({
    centroCostoId: centros.oficina,
    fecha: "2031-08-01",
    importe: "25,00",
  });
  const egresoAnulado = await cargarEgreso({
    centroCostoId: centros.obra,
    fecha: "2031-07-15",
    importe: "9.999,00",
    servicioId: servicioB,
  });
  await abm().marcarEliminado(admin, EGRESOS, egresoAnulado);
  const e8 = await cargarEgreso({
    centroCostoId: centros.obra,
    fecha: "2031-07-05",
    importe: "80,00",
    moneda: "USD",
    servicioId: servicioA,
  });
  await cargarEgreso({
    centroCostoId: centros.oficina,
    fecha: "2031-07-06",
    importe: "20,00",
    moneda: "USD",
    vencimiento: "2031-07-08",
  });

  // Pagos.
  await pagar(e1, pesos, "2031-07-03", "400,00");
  await pagar(e3, pesos, "2031-07-11", "100,00");
  await pagar(e5, pesos, "2031-06-30", "20,00");
  await pagar(e6, pesos, "2031-08-01", "25,00");
  await pagar(e8, dolares, "2031-07-07", "30,00");
  await pagar(e1, pesos, "2031-07-04", "55,00");
  const pagoAnulado = await cliente().pago.findFirstOrThrow({
    where: { importeCentavos: 5_500n },
  });
  await pagos().marcarPagoAnulado(admin, pagoAnulado.id);
});

afterAll(async () => {
  await prisma.actual?.$disconnect();
  await almacenTemporal?.borrar();
});

function delMes(
  resultado: Awaited<ReturnType<ReturnType<typeof tablero>["tablero"]>>,
  moneda: Moneda,
) {
  const fila = resultado.delMes.find((linea) => linea.moneda === moneda);
  expect(fila, `no hay ${moneda} en el mes`).toBeDefined();
  return fila as NonNullable<typeof fila>;
}

const valores = (fila: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(fila).map(([clave, valor]) => [
      clave,
      typeof valor === "object" && valor !== null && "valor" in valor
        ? valor.valor
        : valor,
    ]),
  );

describe("el mes del reloj, por moneda", () => {
  test("julio en pesos: facturado con y sin IVA (medio centavo por factura), cobrado con retención, egresos, pagado y los dos resultados", async () => {
    const resultado = await tablero().tablero({});

    expect(resultado.mes).toMatchObject({
      mes: "2031-07",
      nombre: "julio de 2031",
      anterior: "2031-06",
      siguiente: "2031-08",
      pedidoInvalido: false,
    });
    expect(valores(delMes(resultado, "ARS"))).toEqual({
      moneda: "ARS",
      facturadoSinIva: "ARS 3.001,50",
      facturadoConIva: "ARS 3.421,83",
      cobrado: "ARS 1.421,00",
      egresos: "ARS 2.150,00",
      pagado: "ARS 500,00",
      resultadoDeCaja: "ARS 921,00",
      resultadoDevengado: "ARS 1.851,50",
    });
  });

  test("julio en dólares, sin mezclar con los pesos", async () => {
    const resultado = await tablero().tablero({});

    expect(valores(delMes(resultado, "USD"))).toEqual({
      moneda: "USD",
      facturadoSinIva: "USD 1.100,00",
      facturadoConIva: "USD 1.310,00",
      cobrado: "USD 300,00",
      egresos: "USD 100,00",
      pagado: "USD 30,00",
      resultadoDeCaja: "USD 270,00",
      resultadoDevengado: "USD 1.000,00",
    });
  });

  test("junio y agosto traen solo lo suyo, con los bordes del mes bien cortados; una moneda sin movimientos no aparece", async () => {
    const junio = await tablero().tablero({ mes: "2031-06" });
    const agosto = await tablero().tablero({ mes: "2031-08" });

    expect(junio.delMes.map(({ moneda }) => moneda)).toEqual(["ARS"]);
    expect(valores(delMes(junio, "ARS"))).toEqual({
      moneda: "ARS",
      facturadoSinIva: "ARS 500,00",
      facturadoConIva: "ARS 500,00",
      cobrado: "ARS 100,00",
      egresos: "ARS 40,00",
      pagado: "ARS 20,00",
      resultadoDeCaja: "ARS 80,00",
      resultadoDevengado: "ARS 460,00",
    });
    expect(agosto.delMes.map(({ moneda }) => moneda)).toEqual(["ARS"]);
    expect(valores(delMes(agosto, "ARS"))).toEqual({
      moneda: "ARS",
      facturadoSinIva: "ARS 700,00",
      facturadoConIva: "ARS 700,00",
      cobrado: "ARS 50,00",
      egresos: "ARS 25,00",
      pagado: "ARS 25,00",
      resultadoDeCaja: "ARS 25,00",
      resultadoDevengado: "ARS 675,00",
    });
    expect((await tablero().tablero({ mes: "2031-09" })).delMes).toEqual([]);
  });

  test("sin ?mes, el mes sale del reloj inyectado; un mes inválido muestra el actual y lo avisa", async () => {
    const enAgosto = await tablero(RelojFijo(fecha(2031, 8, 15))).tablero({});
    const invalido = await tablero().tablero({ mes: "2031-13" });
    const noEsMes = await tablero().tablero({ mes: "julio" });

    expect(enAgosto.mes).toMatchObject({
      mes: "2031-08",
      pedidoInvalido: false,
    });
    expect(valores(delMes(enAgosto, "ARS")).facturadoSinIva).toBe("ARS 700,00");
    expect(invalido.mes).toMatchObject({
      mes: "2031-07",
      pedidoInvalido: true,
    });
    expect(noEsMes.mes).toMatchObject({ mes: "2031-07", pedidoInvalido: true });
    expect(valores(delMes(invalido, "ARS")).facturadoSinIva).toBe(
      "ARS 3.001,50",
    );
  });
});

describe("pendientes a la fecha del reloj", () => {
  test("de cobro y de pago por moneda, con lo vencido aparte, sin importar el mes que se mira", async () => {
    const julio = await tablero().tablero({});
    const septiembre = await tablero().tablero({ mes: "2031-09" });

    const esperado = [
      {
        moneda: "ARS",
        porCobrar: "ARS 3.050,83",
        porCobrarVencido: "ARS 1.139,00",
        porPagar: "ARS 1.670,00",
        porPagarVencido: "ARS 200,00",
      },
      {
        moneda: "USD",
        porCobrar: "USD 1.010,00",
        porCobrarVencido: "USD 100,00",
        porPagar: "USD 70,00",
        porPagarVencido: "USD 20,00",
      },
    ];
    expect(julio.pendientes.map(valores)).toEqual(esperado);
    expect(septiembre.pendientes.map(valores)).toEqual(esperado);
    expect(julio.pendientes[0]?.porCobrar.enlace).toBe("/servicios/por-cobrar");
    expect(julio.pendientes[0]?.porPagarVencido.enlace).toBe("/egresos/pagos");
  });

  test("un vencimiento que es hoy todavía no está vencido", async () => {
    const hoyEs08 = await tablero(RelojFijo(fecha(2031, 7, 8))).tablero({});

    // F-0002 (vence el 08/07) y F-0010 en dólares pasan a no vencidas; queda F-0001.
    expect(valores(hoyEs08.pendientes[0] ?? {}).porCobrarVencido).toBe(
      "ARS 400,00",
    );
    expect(valores(hoyEs08.pendientes[1] ?? {}).porCobrarVencido).toBe(
      "USD 0,00",
    );
  });
});

describe("rentabilidad por servicio", () => {
  test("facturado sin IVA menos los egresos de proyecto del servicio, de siempre y por moneda", async () => {
    const { rentabilidad } = await tablero().tablero({});

    expect(
      rentabilidad.map(({ enlace, ...resto }) => ({
        ...resto,
        enlace: enlace.replace(/[0-9a-f-]{36}/, "<id>"),
      })),
    ).toEqual([
      {
        moneda: "ARS",
        servicio: "SRV-2031-001 · Auditoría de ejemplo",
        enlace: "/servicios/<id>",
        facturado: "ARS 2.201,00",
        egresos: "ARS 640,00",
        resultado: "ARS 1.561,00",
      },
      {
        moneda: "USD",
        servicio: "SRV-2031-001 · Auditoría de ejemplo",
        enlace: "/servicios/<id>",
        facturado: "USD 1.100,00",
        egresos: "USD 80,00",
        resultado: "USD 1.020,00",
      },
      {
        moneda: "ARS",
        servicio: "SRV-2031-002 · Servicio B de ejemplo",
        enlace: "/servicios/<id>",
        facturado: "ARS 2.000,50",
        egresos: "ARS 250,00",
        resultado: "ARS 1.750,50",
      },
    ]);
    expect(rentabilidad.map(({ enlace }) => enlace)).toEqual([
      `/servicios/${servicioA}`,
      `/servicios/${servicioA}`,
      `/servicios/${servicioB}`,
    ]);
  });
});

describe("la rentabilidad solo cuenta los centros de proyecto", () => {
  test("un egreso de otra clase imputado a un servicio no resta, aunque los casos de uso no dejen cargarlo", async () => {
    const oficina = await cliente().egreso.findFirstOrThrow({
      where: {
        centroCostoId: centros.oficina,
        importeMoneda: "ARS",
        eliminadoEn: null,
        importeCentavos: 30_000n,
      },
    });
    await cliente().egreso.update({
      where: { id: oficina.id },
      data: { servicioId: servicioB },
    });
    try {
      const { rentabilidad } = await tablero().tablero({});

      expect(rentabilidad.map(({ egresos }) => egresos)).toEqual([
        "ARS 640,00",
        "USD 80,00",
        "ARS 250,00",
      ]);
    } finally {
      await cliente().egreso.update({
        where: { id: oficina.id },
        data: { servicioId: null },
      });
    }
  });
});

describe("egresos por centro de costo", () => {
  test("las tres clases separadas y en orden, cada centro con su total y cada clase con su subtotal", async () => {
    const { egresosPorCentro } = await tablero().tablero({});

    expect(egresosPorCentro.map(({ moneda }) => moneda)).toEqual([
      "ARS",
      "USD",
    ]);
    const pesos = egresosPorCentro[0]?.bloques ?? [];
    expect(
      pesos.map(({ clase, nombre, subtotal }) => [clase, nombre, subtotal]),
    ).toEqual([
      ["proyecto", "Proyecto", "ARS 850,00"],
      ["gestion_administrativa", "Gestión administrativa", "ARS 300,00"],
      ["fuera_de_rentabilidad", "Fuera de rentabilidad", "ARS 1.000,00"],
    ]);
    expect(
      pesos.map(({ centros }) =>
        centros.map(({ nombre, total }) => [nombre, total.valor, total.enlace]),
      ),
    ).toEqual([
      [
        [
          "Obra de ejemplo",
          "ARS 850,00",
          `/egresos?fecha=2031-07&centroCostoId=${centros.obra}`,
        ],
      ],
      [
        [
          "Oficina de ejemplo",
          "ARS 300,00",
          `/egresos?fecha=2031-07&centroCostoId=${centros.oficina}`,
        ],
      ],
      [
        [
          "Inversión de ejemplo",
          "ARS 1.000,00",
          `/egresos?fecha=2031-07&centroCostoId=${centros.inversion}`,
        ],
      ],
    ]);
    const dolares = egresosPorCentro[1]?.bloques ?? [];
    expect(dolares.map(({ subtotal }) => subtotal)).toEqual([
      "USD 80,00",
      "USD 20,00",
      "USD 0,00",
    ]);
    expect(dolares[2]?.centros).toEqual([]);
  });
});

/** `ARS 1.234,50` o `1.234,50` como un importe. */
function importeDe(texto: string, moneda: Moneda): Importe<Moneda> {
  const monto = texto.startsWith(moneda)
    ? texto.slice(moneda.length + 1)
    : texto;
  const leido = parsearImporte(monto, moneda);
  if (!leido.ok) {
    throw new Error(`no se pudo leer ${texto}`);
  }
  return leido.valor;
}

function sumaDe(moneda: Moneda, importes: readonly Importe<Moneda>[]): string {
  return formatearImporte(
    crearImporte(
      importes.reduce((suma, { centavos }) => suma + centavos, 0n),
      moneda,
    ),
  );
}

describe("cada número cierra con la suma del listado al que lleva", () => {
  test.each(MONEDAS)(
    "facturado, cobrado y pagado de julio en %s",
    async (moneda) => {
      const parametros = { mes: "2031-07", moneda };
      const principal = delMes(await tablero().tablero({}), moneda);
      const { listados } = tablero();

      const facturas = await listados.facturas(parametros);
      const cobros = await listados.cobros(parametros);
      const pagosHechos = await listados.pagos(parametros);

      expect(principal.facturadoSinIva.enlace).toBe(
        `/servicios/facturas?mes=2031-07&moneda=${moneda}`,
      );
      expect(principal.cobrado.enlace).toBe(
        `/servicios/cobros?mes=2031-07&moneda=${moneda}`,
      );
      expect(principal.pagado.enlace).toBe(
        `/egresos/pagos-hechos?mes=2031-07&moneda=${moneda}`,
      );
      expect(principal.facturadoSinIva.valor).toBe(
        sumaDe(
          moneda,
          facturas.filas.map(({ sinIva }) => importeDe(sinIva, moneda)),
        ),
      );
      expect(principal.facturadoConIva.valor).toBe(
        sumaDe(
          moneda,
          facturas.filas.map(({ total }) => importeDe(total, moneda)),
        ),
      );
      expect(principal.facturadoSinIva.valor).toBe(facturas.totalSinIva);
      expect(principal.facturadoConIva.valor).toBe(facturas.total);
      expect(principal.cobrado.valor).toBe(
        sumaDe(
          moneda,
          cobros.filas.map(({ total }) => importeDe(total, moneda)),
        ),
      );
      expect(principal.cobrado.valor).toBe(cobros.total);
      expect(principal.pagado.valor).toBe(
        sumaDe(
          moneda,
          pagosHechos.filas.map(({ importe }) => importeDe(importe, moneda)),
        ),
      );
      expect(principal.pagado.valor).toBe(pagosHechos.total);
    },
  );

  test("los listados de julio en pesos traen las filas esperadas, con el IVA de cada factura redondeado por separado", async () => {
    const { listados } = tablero();

    const facturas = await listados.facturas({ mes: "2031-07", moneda: "ARS" });
    const cobros = await listados.cobros({ mes: "2031-07", moneda: "ARS" });
    const pagosHechos = await listados.pagos({ mes: "2031-07", moneda: "ARS" });

    expect(
      facturas.filas.map(({ numero, fecha, sinIva, iva, total }) => [
        numero,
        fecha,
        sinIva,
        iva,
        total,
      ]),
    ).toEqual([
      ["F-0002", "04/07/2031", "1.000,00", "210,00", "1.210,00"],
      ["F-0003", "05/07/2031", "0,50", "0,11", "0,61"],
      ["F-0004", "06/07/2031", "0,50", "0,11", "0,61"],
      ["F-0005", "07/07/2031", "0,50", "0,11", "0,61"],
      ["F-0006", "31/07/2031", "2.000,00", "210,00", "2.210,00"],
    ]);
    expect(facturas.totalIva).toBe("ARS 420,33");
    expect(
      cobros.filas.map(({ factura, fecha, importe, retencion, total }) => [
        factura,
        fecha,
        importe,
        retencion,
        total,
      ]),
    ).toEqual([
      ["F-0002", "09/07/2031", "400,00", "21,00", "421,00"],
      ["F-0006", "31/07/2031", "1.000,00", "", "1.000,00"],
    ]);
    expect(
      pagosHechos.filas.map(({ fecha, importe }) => [fecha, importe]),
    ).toEqual([
      ["03/07/2031", "400,00"],
      ["11/07/2031", "100,00"],
    ]);
  });

  test("los pendientes salen de las mismas consultas que Por cobrar y Por pagar", async () => {
    const principal = await tablero().tablero({});
    const porCobrar = await cobros(almacenTemporal.almacen).porCobrar();
    const porPagar = await pagos().porPagar({});

    for (const moneda of MONEDAS) {
      const pendiente = principal.pendientes.find(
        (linea) => linea.moneda === moneda,
      );
      const cobro = porCobrar.filas.filter(({ saldo }) =>
        saldo.startsWith(moneda),
      );
      const pago = porPagar.filas.filter(({ saldo }) =>
        saldo.startsWith(moneda),
      );

      expect(pendiente?.porCobrar.valor).toBe(
        sumaDe(
          moneda,
          cobro.map(({ saldo }) => importeDe(saldo, moneda)),
        ),
      );
      expect(pendiente?.porCobrarVencido.valor).toBe(
        sumaDe(
          moneda,
          cobro
            .filter(({ atraso }) => atraso !== "")
            .map(({ saldo }) => importeDe(saldo, moneda)),
        ),
      );
      expect(pendiente?.porPagar.valor).toBe(
        sumaDe(
          moneda,
          pago.map(({ saldo }) => importeDe(saldo, moneda)),
        ),
      );
      expect(pendiente?.porPagarVencido.valor).toBe(
        sumaDe(
          moneda,
          pago
            .filter(({ atraso }) => atraso !== "")
            .map(({ saldo }) => importeDe(saldo, moneda)),
        ),
      );
    }
    expect(porCobrar.saldos).toEqual(
      principal.pendientes.map(({ porCobrar: cifra }) => cifra.valor),
    );
    expect(porPagar.saldos).toEqual(
      principal.pendientes.map(({ porPagar: cifra }) => cifra.valor),
    );
  });

  test("los egresos del mes y de cada centro cierran con el listado de /egresos al que llevan", async () => {
    const principal = await tablero().tablero({});

    async function delListado(enlace: string, moneda: Moneda): Promise<string> {
      const consulta = Object.fromEntries(
        new URL(enlace, "http://ejemplo.test").searchParams,
      );
      const importes: Importe<Moneda>[] = [];
      for (let pagina = 1, paginas = 1; pagina <= paginas; pagina += 1) {
        const lista = await abm().listar(EGRESOS, { ...consulta, pagina });
        paginas = lista.paginas;
        importes.push(
          ...lista.registros
            .map(({ valor }) => valor.importe)
            .filter((importe) => importe.moneda === moneda),
        );
      }
      return sumaDe(moneda, importes);
    }

    for (const moneda of MONEDAS) {
      const linea = delMes(principal, moneda);
      expect(linea.egresos.enlace).toBe("/egresos?fecha=2031-07");
      expect(linea.egresos.valor).toBe(
        await delListado(linea.egresos.enlace ?? "", moneda),
      );
      const bloques =
        principal.egresosPorCentro.find((bloque) => bloque.moneda === moneda)
          ?.bloques ?? [];
      for (const bloque of bloques) {
        for (const centro of bloque.centros) {
          expect(centro.total.valor).toBe(
            await delListado(centro.total.enlace ?? "", moneda),
          );
        }
        expect(bloque.subtotal).toBe(
          sumaDe(
            moneda,
            bloque.centros.map(({ total }) => importeDe(total.valor, moneda)),
          ),
        );
      }
    }
  });

  test("la rentabilidad de cada servicio cierra con sus facturas y sus egresos en la pantalla del servicio", async () => {
    const { rentabilidad } = await tablero().tablero({});
    const sinIvaDe = (texto: string) =>
      importeDe(texto, texto.startsWith("USD") ? "USD" : "ARS");

    for (const fila of rentabilidad) {
      const servicioId = fila.enlace.replace("/servicios/", "");
      const deLaFactura = (
        await facturas(almacenTemporal.almacen).listar(servicioId)
      )
        .map(({ sinIva }) => sinIva)
        .filter((texto) => texto.startsWith(fila.moneda));
      const { egresos } = await crearCasosUsoEgresosDeServicio(
        dependencias(),
      ).listar(servicioId);
      const deLosEgresos = egresos
        .map(({ importe }) => importe)
        .filter((texto) => texto.startsWith(fila.moneda));

      expect(fila.facturado).toBe(
        sumaDe(fila.moneda, deLaFactura.map(sinIvaDe)),
      );
      expect(fila.egresos).toBe(
        sumaDe(fila.moneda, deLosEgresos.map(sinIvaDe)),
      );
    }
  });
});

/** El inicio dibujado con los números de la base sembrada: lo que se ve, no el dato intermedio. */
async function inicioDibujado(mes?: string): Promise<string> {
  const resultado = await tablero().tablero(mes === undefined ? {} : { mes });
  return renderToStaticMarkup(
    createElement(TableroDeInicio, { tablero: resultado }),
  );
}

function cifraVista(html: string, id: string): string | undefined {
  return new RegExp(`data-cifra="${id}"[^>]*>([^<]*)<`).exec(html)?.[1];
}

function subtotalVisto(html: string, id: string): string | undefined {
  return new RegExp(`data-subtotal="${id}"[^>]*>([^<]*)<`).exec(html)?.[1];
}

function celdasDeLaFila(html: string, que: string): string[] | undefined {
  return [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)]
    .map(([, fila]) =>
      [...(fila ?? "").matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/g)].map(
        ([, celda]) => (celda ?? "").replace(/<[^>]+>/g, ""),
      ),
    )
    .find((celdas) => celdas.join("|").startsWith(que));
}

describe("lo que se ve en el inicio", () => {
  test("cada cifra del mes está en su lugar y con su valor, en pesos y en dólares", async () => {
    const html = await inicioDibujado();

    const vistas = Object.fromEntries(
      ["ARS", "USD"].flatMap((moneda) =>
        [
          "facturado-sin-iva",
          "facturado-con-iva",
          "cobrado",
          "egresos",
          "pagado",
          "resultado-de-caja",
          "resultado-devengado",
        ].map((clave) => [
          `${moneda}-${clave}`,
          cifraVista(html, `${moneda}-${clave}`),
        ]),
      ),
    );

    expect(vistas).toEqual({
      "ARS-facturado-sin-iva": "ARS 3.001,50",
      "ARS-facturado-con-iva": "ARS 3.421,83",
      "ARS-cobrado": "ARS 1.421,00",
      "ARS-egresos": "ARS 2.150,00",
      "ARS-pagado": "ARS 500,00",
      "ARS-resultado-de-caja": "ARS 921,00",
      "ARS-resultado-devengado": "ARS 1.851,50",
      "USD-facturado-sin-iva": "USD 1.100,00",
      "USD-facturado-con-iva": "USD 1.310,00",
      "USD-cobrado": "USD 300,00",
      "USD-egresos": "USD 100,00",
      "USD-pagado": "USD 30,00",
      "USD-resultado-de-caja": "USD 270,00",
      "USD-resultado-devengado": "USD 1.000,00",
    });
  });

  test("los pendientes con su vencido, la rentabilidad y los egresos por centro con sus subtotales", async () => {
    const html = await inicioDibujado();

    expect(
      Object.fromEntries(
        ["ARS", "USD"].flatMap((moneda) =>
          [
            "por-cobrar",
            "por-cobrar-vencido",
            "por-pagar",
            "por-pagar-vencido",
          ].map((clave) => [
            `${moneda}-${clave}`,
            cifraVista(html, `${moneda}-${clave}`),
          ]),
        ),
      ),
    ).toEqual({
      "ARS-por-cobrar": "ARS 3.050,83",
      "ARS-por-cobrar-vencido": "ARS 1.139,00",
      "ARS-por-pagar": "ARS 1.670,00",
      "ARS-por-pagar-vencido": "ARS 200,00",
      "USD-por-cobrar": "USD 1.010,00",
      "USD-por-cobrar-vencido": "USD 100,00",
      "USD-por-pagar": "USD 70,00",
      "USD-por-pagar-vencido": "USD 20,00",
    });
    expect(
      celdasDeLaFila(html, "SRV-2031-001 · Auditoría de ejemplo|ARS"),
    ).toEqual([
      "SRV-2031-001 · Auditoría de ejemplo",
      "ARS",
      "ARS 2.201,00",
      "ARS 640,00",
      "ARS 1.561,00",
    ]);
    expect(
      celdasDeLaFila(html, "SRV-2031-002 · Servicio B de ejemplo|ARS"),
    ).toEqual([
      "SRV-2031-002 · Servicio B de ejemplo",
      "ARS",
      "ARS 2.000,50",
      "ARS 250,00",
      "ARS 1.750,50",
    ]);
    expect(
      [
        "ARS-proyecto",
        "ARS-gestion_administrativa",
        "ARS-fuera_de_rentabilidad",
        "USD-proyecto",
        "USD-gestion_administrativa",
        "USD-fuera_de_rentabilidad",
      ].map((id) => subtotalVisto(html, id)),
    ).toEqual([
      "ARS 850,00",
      "ARS 300,00",
      "ARS 1.000,00",
      "USD 80,00",
      "USD 20,00",
      "USD 0,00",
    ]);
    expect(cifraVista(html, "ARS-proyecto-Obra de ejemplo")).toBe("ARS 850,00");
    expect(
      cifraVista(html, "ARS-gestion_administrativa-Oficina de ejemplo"),
    ).toBe("ARS 300,00");
    expect(
      cifraVista(html, "ARS-fuera_de_rentabilidad-Inversión de ejemplo"),
    ).toBe("ARS 1.000,00");
  });
});
