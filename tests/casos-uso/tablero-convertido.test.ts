/**
 * El tablero en una sola moneda (F3-08, ADR 0042) contra el Postgres del
 * arnés: documentos en dólares con **tipos de cambio distintos cada uno**,
 * documentos en pesos que toman el último tipo de cambio cargado a esa fecha
 * y documentos sin ninguno. Cada total está calculado a mano en los
 * comentarios. Datos inventados. Necesita Docker.
 *
 * Reloj fijo: 09/07/2031. Mes del tablero: julio de 2031.
 *
 * Los tipos de cambio (pesos por dólar) y quién los fija para los pesos:
 *   F0  20/06  USD 10,00     800,00   · F7  30/04  USD 1,00   1.000,00
 *   F1  04/07  USD 100,00  1.000,50   · F2  20/07  USD 50,25  1.100,10
 *   E1  10/07  USD 200,00    900,00
 * Un documento en pesos usa el más reciente de esos con fecha igual o anterior.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { crearGeneradorIdCrypto } from "../../src/adaptadores/memoria/generador-id.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearTransaccionalPrisma } from "../../src/adaptadores/prisma/transaccion.ts";
import { TableroDeInicio } from "../../src/app/_ui/tablero-de-inicio.tsx";
import { crearCasosUsoTablero } from "../../src/casos-uso/tablero/tablero.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { ADMIN_UNO, sembrarUsuarios } from "./_arnes/administradores.ts";
import {
  type AlmacenTemporal,
  crearAlmacenTemporal,
} from "./_arnes/almacen-temporal.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import {
  altaDeServicio,
  conModalidad,
  llevarServicioA,
  sembrarServicio,
} from "./_arnes/servicio.ts";
import { ayudasDelTablero } from "./_arnes/tablero.ts";

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

const prisma = {
  actual: undefined as ReturnType<typeof crearClientePrisma> | undefined,
};
let almacenTemporal: AlmacenTemporal;
let admin: Actor;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma.actual, "el cliente de Prisma no se armó").toBeDefined();
  return prisma.actual as ReturnType<typeof crearClientePrisma>;
}

function dependencias() {
  return {
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(HOY),
    generadorId: crearGeneradorIdCrypto(),
  };
}

const tablero = () => crearCasosUsoTablero(dependencias());
const {
  altaDeCentro,
  altaDeCuenta,
  cargarFactura,
  cobrar,
  cargarEgreso,
  pagar,
} = ayudasDelTablero({
  dependencias,
  admin: () => admin,
  almacen: () => almacenTemporal.almacen,
});

/** Un documento anterior a F3-04: en dólares y sin tipo de cambio. */
async function quitarElCambioDeLaFactura(id: string): Promise<void> {
  await cliente()
    .$executeRaw`UPDATE facturas SET cambio_numerador = NULL, cambio_denominador = NULL, cambio_fuente = NULL WHERE id = ${id}::uuid`;
}

async function quitarElCambioDelEgreso(id: string): Promise<void> {
  await cliente()
    .$executeRaw`UPDATE egresos SET cambio_numerador = NULL, cambio_denominador = NULL, cambio_fuente = NULL WHERE id = ${id}::uuid`;
}

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
  const servicioA = await sembrarServicio(
    cliente(),
    dependencias(),
    admin,
    primero.id,
  );
  const servicioB = await altaDeServicio(
    cliente(),
    dependencias(),
    admin,
    primero.id,
    "Servicio B de ejemplo",
  );
  const extras: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    extras.push(
      await altaDeServicio(
        cliente(),
        dependencias(),
        admin,
        primero.id,
        `Servicio extra ${i + 1}`,
      ),
    );
  }
  for (const id of [servicioA, servicioB, ...extras]) {
    await conModalidad(cliente(), id);
    await llevarServicioA(
      dependencias().transaccional,
      admin,
      id,
      ["cotizado", "adjudicado", "en_ejecucion"],
      HOY,
    );
  }
  const obra = await altaDeCentro("Obra de ejemplo", "proyecto");
  const oficina = await altaDeCentro(
    "Oficina de ejemplo",
    "gestion_administrativa",
  );
  const inversion = await altaDeCentro(
    "Inversión de ejemplo",
    "fuera_de_rentabilidad",
  );
  const cajaPesos = await altaDeCuenta("Caja en pesos", "ARS");
  const cajaDolares = await altaDeCuenta("Caja en dólares", "USD");

  const alicuota = "0" as const;
  await cargarFactura(servicioA, {
    numero: "F-0100",
    fecha: "2031-06-20",
    vencimiento: "2031-06-30",
    importe: "10,00",
    moneda: "USD",
    cambio: "800,00",
    alicuota,
  });
  const f1 = await cargarFactura(servicioA, {
    numero: "F-0101",
    fecha: "2031-07-04",
    vencimiento: "2031-08-04",
    importe: "100,00",
    moneda: "USD",
    cambio: "1.000,50",
    alicuota,
  });
  await cargarFactura(servicioB, {
    numero: "F-0102",
    fecha: "2031-07-20",
    vencimiento: "2031-08-20",
    importe: "50,25",
    moneda: "USD",
    cambio: "1.100,10",
    alicuota,
  });
  const f3 = await cargarFactura(servicioA, {
    numero: "F-0103",
    fecha: "2031-07-01",
    vencimiento: "2031-07-05",
    importe: "20.000,00",
    alicuota,
  });
  const f4 = await cargarFactura(servicioA, {
    numero: "F-0104",
    fecha: "2031-07-02",
    vencimiento: "2031-08-02",
    importe: "5.000,00",
    alicuota,
  });
  await cargarFactura(servicioA, {
    numero: "F-0105",
    fecha: "2030-09-10",
    vencimiento: "2030-10-10",
    importe: "1.000,00",
    alicuota,
  });
  const f6 = await cargarFactura(servicioB, {
    numero: "F-0106",
    fecha: "2031-07-08",
    vencimiento: "2031-07-30",
    importe: "30,00",
    moneda: "USD",
    alicuota,
  });
  const f7 = await cargarFactura(servicioA, {
    numero: "F-0107",
    fecha: "2031-04-30",
    vencimiento: "2031-05-30",
    importe: "1,00",
    moneda: "USD",
    cambio: "1.000,00",
    alicuota,
  });
  await quitarElCambioDeLaFactura(f6);

  for (const [i, id] of extras.entries()) {
    const importe = `${1000 - i * 10},00`;
    const factura = await cargarFactura(id, {
      numero: `F-02${String(i).padStart(2, "0")}`,
      fecha: "2031-05-10",
      vencimiento: "2031-06-10",
      importe,
      alicuota,
    });
    await cobrar(factura, cajaPesos, "2031-05-28", importe);
  }
  await cobrar(f7, cajaDolares, "2031-04-30", "1,00");

  await cobrar(f1, cajaDolares, "2031-07-06", "40,00");
  await cobrar(f3, cajaPesos, "2031-07-06", "10.000,00", "1.000,00");
  await cobrar(f4, cajaPesos, "2031-07-03", "1.000,00");

  const e1 = await cargarEgreso({
    centroCostoId: oficina,
    fecha: "2031-07-10",
    importe: "200,00",
    moneda: "USD",
    cambio: "900,00",
  });
  const e2 = await cargarEgreso({
    centroCostoId: obra,
    fecha: "2031-07-12",
    importe: "9.000,00",
    servicioId: servicioA,
  });
  await cargarEgreso({
    centroCostoId: inversion,
    fecha: "2031-07-20",
    importe: "3.000,00",
  });
  const e4 = await cargarEgreso({
    centroCostoId: oficina,
    fecha: "2031-07-03",
    importe: "5,00",
    moneda: "USD",
  });
  await cargarEgreso({
    centroCostoId: oficina,
    fecha: "2031-06-25",
    importe: "4.000,00",
    vencimiento: "2031-06-30",
  });
  await quitarElCambioDelEgreso(e4);

  await pagar(e1, cajaDolares, "2031-07-11", "50,00");
  await pagar(e2, cajaPesos, "2031-07-13", "3.000,00");
}, 120_000);

afterAll(async () => {
  await prisma.actual?.$disconnect();
  await almacenTemporal?.borrar();
});

describe("el mes elegido, en pesos", () => {
  // Facturado: 100.050,00 (F1) + 55.280,03 (F2: 5.528.002,5 centavos, sube) + 20.000,00 + 5.000,00;
  //   F6 es en dólares y no tiene tipo de cambio: queda afuera.
  // Egresos: 180.000,00 (E1) + 9.000,00 + 3.000,00; E4, sin tipo de cambio, afuera.
  // Devengado: facturado menos 180.000,00 y 9.000,00 (los 3.000,00 son de fuera de rentabilidad).
  // Cobrado: 40.020,00 (cobro de F1) + 11.000,00 (importe y retención de F3) + 1.000,00.
  // Pagado: 45.000,00 (50 dólares de E1) + 3.000,00.
  test("cada número convierte cada documento con su tipo de cambio", async () => {
    const { convertido } = await tablero().tablero({ mes: "2031-07" });

    expect(convertido.moneda).toBe("ARS");
    expect({
      facturado: convertido.facturado.valor,
      cobrado: convertido.cobrado.valor,
      egresos: convertido.egresos.valor,
      pagado: convertido.pagado.valor,
      resultadoDeCaja: convertido.resultadoDeCaja.valor,
      resultadoDevengado: convertido.resultadoDevengado.valor,
    }).toEqual({
      facturado: "ARS 180.330,03",
      cobrado: "ARS 52.020,00",
      egresos: "ARS 192.000,00",
      pagado: "ARS 48.000,00",
      resultadoDeCaja: "ARS 4.020,00",
      resultadoDevengado: "ARS -8.669,97",
    });
  });

  // Por cobrar: F0 8.000,00 + F1 60.030,00 + F2 55.280,03 + F3 9.000,00 + F4 4.000,00 + F5 1.000,00 + F7 0
  //   (F6 afuera); vencido: F0, F3 y F5.
  // Por pagar: E1 135.000,00 + E2 6.000,00 + E3 3.000,00 + E5 4.000,00; vencido: E5.
  test("los pendientes y lo vencido, a la fecha del reloj", async () => {
    const { convertido } = await tablero().tablero({ mes: "2031-07" });

    expect({
      porCobrar: convertido.porCobrar.valor,
      porCobrarVencido: convertido.porCobrarVencido.valor,
      porPagar: convertido.porPagar.valor,
      porPagarVencido: convertido.porPagarVencido.valor,
    }).toEqual({
      porCobrar: "ARS 137.310,03",
      porCobrarVencido: "ARS 18.000,00",
      porPagar: "ARS 148.000,00",
      porPagarVencido: "ARS 4.000,00",
    });
  });

  test("las doce barras: doce meses terminando en el elegido", async () => {
    const { convertido } = await tablero().tablero({ mes: "2031-07" });

    expect(convertido.meses.map(({ mes }) => mes)).toEqual([
      "2030-08",
      "2030-09",
      "2030-10",
      "2030-11",
      "2030-12",
      "2031-01",
      "2031-02",
      "2031-03",
      "2031-04",
      "2031-05",
      "2031-06",
      "2031-07",
    ]);
    expect(
      convertido.meses.map(({ facturado, egresos }) => [facturado, egresos]),
    ).toEqual([
      [0, 0],
      [1000, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [1000, 0],
      [9550, 0],
      [8000, 4000],
      [180330.03, 192000],
    ]);
  });

  // A: 8.000,00 + 100.050,00 + 20.000,00 + 5.000,00 + 1.000,00 + 1.000,00 menos los 9.000,00 de E2;
  // B: 55.280,03. Los diez servicios que siguen, de 1.000,00 para abajo: los ocho primeros
  // van solos y los dos últimos (920,00 y 910,00) se suman en «Otros».
  test("la rentabilidad: los diez de mayor facturación y el resto en «Otros»", async () => {
    const { convertido } = await tablero().tablero({ mes: "2031-07" });

    expect(convertido.rentabilidad).toEqual([
      { etiqueta: "001/31", resultado: 126050 },
      { etiqueta: "002/31", resultado: 55280.03 },
      { etiqueta: "003/31", resultado: 1000 },
      { etiqueta: "004/31", resultado: 990 },
      { etiqueta: "005/31", resultado: 980 },
      { etiqueta: "006/31", resultado: 970 },
      { etiqueta: "007/31", resultado: 960 },
      { etiqueta: "008/31", resultado: 950 },
      { etiqueta: "009/31", resultado: 940 },
      { etiqueta: "010/31", resultado: 930 },
      { etiqueta: "Otros", resultado: 1830 },
    ]);
  });
});

describe("el mes elegido, en dólares", () => {
  // Facturado: F1 100,00 + F2 50,25 + F6 30,00 (ya está en dólares: no necesita cambio)
  //   + F3 25,00 (20.000,00 a 800, el de F0) + F4 6,25 (5.000,00 a 800).
  // Egresos: E1 200,00 + E4 5,00 + E2 10,00 (9.000,00 a 900) + E3 2,73 (3.000,00 a 1.100,10).
  // Devengado: facturado menos E1, E4 y E2.
  // Cobrado: 40,00 + 13,75 (11.000,00 a 800) + 1,25 (1.000,00 a 800). Pagado: 50,00 + 3,33 (3.000,00 a 900).
  test("cada número convierte cada documento con su tipo de cambio", async () => {
    const { convertido } = await tablero().tablero({
      mes: "2031-07",
      moneda: "USD",
    });

    expect({
      facturado: convertido.facturado.valor,
      cobrado: convertido.cobrado.valor,
      egresos: convertido.egresos.valor,
      pagado: convertido.pagado.valor,
      resultadoDeCaja: convertido.resultadoDeCaja.valor,
      resultadoDevengado: convertido.resultadoDevengado.valor,
    }).toEqual({
      facturado: "USD 211,50",
      cobrado: "USD 55,00",
      egresos: "USD 217,73",
      pagado: "USD 53,33",
      resultadoDeCaja: "USD 1,67",
      resultadoDevengado: "USD -3,50",
    });
  });

  // Por cobrar: F0 10,00 + F1 60,00 + F2 50,25 + F3 11,25 + F4 5,00 + F6 30,00 (F5 no tiene cambio a su fecha).
  // Por pagar: E1 150,00 + E2 6,67 + E3 2,73 + E4 5,00 + E5 5,00 (4.000,00 a 800).
  test("los pendientes y lo vencido", async () => {
    const { convertido } = await tablero().tablero({
      mes: "2031-07",
      moneda: "USD",
    });

    expect({
      porCobrar: convertido.porCobrar.valor,
      porCobrarVencido: convertido.porCobrarVencido.valor,
      porPagar: convertido.porPagar.valor,
      porPagarVencido: convertido.porPagarVencido.valor,
    }).toEqual({
      porCobrar: "USD 166,50",
      porCobrarVencido: "USD 21,25",
      porPagar: "USD 169,40",
      porPagarVencido: "USD 5,00",
    });
  });

  test("las barras y la rentabilidad, sin lo que no tiene tipo de cambio", async () => {
    const { convertido } = await tablero().tablero({
      mes: "2031-07",
      moneda: "USD",
    });

    expect(
      convertido.meses.map(({ facturado, egresos }) => [facturado, egresos]),
    ).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [1, 0],
      [9.55, 0],
      [10, 5],
      [211.5, 217.73],
    ]);
    expect(convertido.rentabilidad.slice(0, 3)).toEqual([
      { etiqueta: "001/31", resultado: 132.25 },
      { etiqueta: "002/31", resultado: 80.25 },
      { etiqueta: "003/31", resultado: 1 },
    ]);
    expect(convertido.rentabilidad.at(-1)).toEqual({
      etiqueta: "Otros",
      resultado: 1.83,
    });
  });
});

describe("los documentos sin tipo de cambio", () => {
  test("en pesos: los dos en dólares sin cambio, y el aviso es el largo de la lista", async () => {
    const resultado = await tablero().tablero({ mes: "2031-07" });
    const lista = await tablero().sinTipoDeCambio({});

    expect(resultado.convertido.sinCambio).toBe(2);
    expect(lista.moneda).toBe("ARS");
    expect(lista.filas).toEqual([
      expect.objectContaining({
        tipo: "Egreso",
        fecha: "03/07/2031",
        importe: "USD 5,00",
      }),
      expect.objectContaining({
        tipo: "Factura",
        numero: "F-0106",
        fecha: "08/07/2031",
        importe: "USD 30,00",
      }),
    ]);
    expect(lista.filas.length).toBe(resultado.convertido.sinCambio);
  });

  test("en dólares: la factura en pesos anterior a todo tipo de cambio", async () => {
    const resultado = await tablero().tablero({
      mes: "2031-07",
      moneda: "USD",
    });
    const lista = await tablero().sinTipoDeCambio({ moneda: "USD" });

    expect(resultado.convertido.sinCambio).toBe(1);
    expect(lista.filas).toEqual([
      expect.objectContaining({
        tipo: "Factura",
        numero: "F-0105",
        fecha: "10/09/2030",
        importe: "ARS 1.000,00",
      }),
    ]);
  });

  test("cada fila lleva a la pantalla de su documento, y se puede ordenar", async () => {
    const lista = await tablero().sinTipoDeCambio({
      orden: "tipo",
      direccion: "desc",
    });

    expect(lista.filas.map(({ tipo }) => tipo)).toEqual(["Factura", "Egreso"]);
    expect(lista.filas.map(({ enlace }) => enlace)).toEqual([
      expect.stringMatching(/^\/servicios\/[0-9a-f-]{36}$/),
      expect.stringMatching(/^\/egresos\/[0-9a-f-]{36}$/),
    ]);
  });

  test("una moneda inválida vuelve a pesos", async () => {
    const lista = await tablero().sinTipoDeCambio({ moneda: "EUR" });

    expect(lista.moneda).toBe("ARS");
    expect((await tablero().tablero({ moneda: "EUR" })).convertido.moneda).toBe(
      "ARS",
    );
  });
});

function cifraVista(html: string, id: string): string | undefined {
  return new RegExp(`data-cifra="${id}"[^>]*>([^<]*)<`).exec(html)?.[1];
}

/** El inicio dibujado con los números de la base sembrada: lo que se ve, no el dato intermedio. */
async function inicioDibujado(
  moneda: string,
  sinCambio?: number,
): Promise<string> {
  const resultado = await tablero().tablero({ mes: "2031-07", moneda });
  return renderToStaticMarkup(
    createElement(TableroDeInicio, {
      tablero:
        sinCambio === undefined
          ? resultado
          : {
              ...resultado,
              convertido: { ...resultado.convertido, sinCambio },
            },
    }),
  );
}

const sinEtiquetas = (html: string) => html.replace(/<[^>]+>/g, "");

function kpiVisto(html: string, id: string): string | undefined {
  return new RegExp(`data-kpi="${id}"[^>]*>([^<]*)<`).exec(html)?.[1];
}

describe("lo que se ve en el inicio, en una sola moneda", () => {
  test("en pesos: la facturación en grande, el resto de los números y el aviso que lleva a la lista", async () => {
    const html = await inicioDibujado("ARS");

    expect(kpiVisto(html, "facturacion")).toBe("ARS 180.330,03");
    expect(kpiVisto(html, "resultado-de-caja")).toBe("ARS 4.020,00");
    expect(kpiVisto(html, "por-cobrar-vencido")).toBe("ARS 18.000,00");
    expect(html).toMatch(
      /<a href="\/sin-tipo-de-cambio\?moneda=ARS"[^>]*>2 documentos sin tipo de cambio<\/a>/,
    );
    expect(sinEtiquetas(html)).toContain(
      "Pesos convertidos con el último tipo de cambio cargado a esa fecha.",
    );
  });

  test("en dólares: el aviso en singular, y el selector deja el mes y marca la moneda", async () => {
    const html = await inicioDibujado("USD");

    expect(kpiVisto(html, "facturacion")).toBe("USD 211,50");
    expect(html).toContain(">1 documento sin tipo de cambio</a>");
    expect(html).toMatch(
      /<a href="\/\?mes=2031-07&amp;moneda=ARS"[^>]*>Pesos<\/a>/,
    );
    expect(html).toMatch(
      /<a href="\/\?mes=2031-07&amp;moneda=USD"[^>]*aria-current="true"[^>]*>Dólares<\/a>/,
    );
  });

  test("sin documentos sin tipo de cambio no hay aviso", async () => {
    expect(await inicioDibujado("ARS", 0)).not.toContain(
      "sin tipo de cambio</a>",
    );
  });

  test("los dos gráficos llevan los números de los doce meses y de los servicios", async () => {
    const html = await inicioDibujado("ARS");

    expect(sinEtiquetas(html)).toContain("07/31180.330,03192.000");
    expect(sinEtiquetas(html)).toContain("001/31126.050002/3155.280,03");
  });

  test("las tarjetas de cada moneda siguen sin convertir y con su enlace", async () => {
    const html = await inicioDibujado("USD");

    expect(cifraVista(html, "ARS-facturado-sin-iva")).toBeDefined();
    expect(html).toMatch(
      /<a href="\/servicios\/facturas\?mes=2031-07&amp;moneda=USD"[^>]*data-cifra="USD-facturado-sin-iva"/,
    );
  });
});
