/**
 * F3-03 · Lo devengado y lo que falta facturar de un servicio, por moneda: los
 * casos con nombre y las cuatro propiedades de la spec. La fecha entra siempre
 * por parámetro (ningún test lee el reloj del sistema). Importes inventados.
 */

import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  crearImporte,
  type Importe,
  MONEDAS,
  type Moneda,
} from "../../src/dominio/compartido/importe.ts";
import {
  crearFechaHora,
  type FechaHora,
  sumarMeses,
  ultimoDiaDelMes,
} from "../../src/dominio/compartido/reloj.ts";
import {
  type Cuota,
  cuotaDelMes,
  type DatosDevengado,
  devengadoPorMoneda,
} from "../../src/dominio/servicios/devengado.ts";
import {
  admiteFactura,
  ESTADOS_SERVICIO,
  type EstadoServicio,
  MODALIDADES_DE_FACTURACION,
  type ModalidadDeFacturacion,
} from "../../src/dominio/servicios/estados.ts";
import { configuracion } from "./_arnes/propiedad.ts";

function dia(anio: number, mes: number, numero = 1): FechaHora {
  const resultado = crearFechaHora({
    anio,
    mes,
    dia: numero,
    hora: 0,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
}

const ars = (pesos: number) => crearImporte(BigInt(pesos) * 100n, "ARS");
const usd = (dolares: number) => crearImporte(BigInt(dolares) * 100n, "USD");

const cuota = (desde: FechaHora, importe: Importe<Moneda>): Cuota => ({
  desde,
  importe,
});

const BASE: DatosDevengado = {
  modalidad: null,
  estado: "en_ejecucion",
  orden: ars(1000),
  facturas: [],
  cuotas: [],
  fecha: dia(2031, 7, 15),
};

/** Las líneas como texto corto, para comparar de un vistazo: `ARS 0/0/0` es devengado/facturado/por facturar en pesos. */
function lineas(datos: Partial<DatosDevengado>): string[] {
  return devengadoPorMoneda({ ...BASE, ...datos }).map(
    ({ moneda, devengado, facturado, porFacturar }) =>
      `${moneda} ${devengado.centavos / 100n}/${facturado.centavos / 100n}/${porFacturar.centavos / 100n}`,
  );
}

describe("puntual", () => {
  test.each(
    ESTADOS_SERVICIO.map((estado) => [
      estado,
      estado === "finalizado" || estado === "cerrado" ? "1000" : "0",
    ]),
  )("en %s el devengado es %s", (estado, devengado) => {
    expect(lineas({ modalidad: "puntual", estado })).toEqual([
      `ARS ${devengado}/0/${devengado}`,
    ]);
  });

  test("facturado de más, el por facturar queda negativo: no se recorta", () => {
    expect(
      lineas({
        modalidad: "puntual",
        estado: "finalizado",
        facturas: [ars(700), ars(500)],
      }),
    ).toEqual(["ARS 1000/1200/-200"]);
  });

  test("sin orden de compra no devenga nada", () => {
    expect(
      lineas({ modalidad: "puntual", estado: "finalizado", orden: null }),
    ).toEqual([]);
  });
});

describe("por hitos (libre)", () => {
  test("el devengado es lo facturado y el por facturar es el saldo de la orden, no devengado − facturado", () => {
    expect(
      lineas({ modalidad: "por_hitos", facturas: [ars(300), ars(200)] }),
    ).toEqual(["ARS 500/500/500"]);
  });

  test("lo facturado en otra moneda devenga en su moneda y no toca el saldo de la orden", () => {
    expect(
      lineas({ modalidad: "por_hitos", facturas: [ars(300), usd(40)] }),
    ).toEqual(["ARS 300/300/700", "USD 40/40/0"]);
  });

  test("facturado de más que la orden: el saldo negativo es el por facturar", () => {
    expect(lineas({ modalidad: "por_hitos", facturas: [ars(1100)] })).toEqual([
      "ARS 1100/1100/-100",
    ]);
  });
});

describe("mensual", () => {
  const INICIO = dia(2031, 5);

  test("suma la cuota de cada mes desde el inicio hasta el mes de la fecha, inclusive", () => {
    const cuotas = [cuota(INICIO, ars(100))];
    expect(lineas({ modalidad: "mensual", cuotas })).toEqual(["ARS 300/0/300"]);
    expect(
      lineas({ modalidad: "mensual", cuotas, fecha: dia(2031, 5, 1) }),
    ).toEqual(["ARS 100/0/100"]);
  });

  test("antes del mes de inicio no devenga nada", () => {
    expect(
      lineas({
        modalidad: "mensual",
        cuotas: [cuota(INICIO, ars(100))],
        fecha: dia(2031, 4, 30),
      }),
    ).toEqual(["ARS 0/0/0"]);
  });

  test("un ajuste rige desde su mes en adelante y no cambia los meses de antes", () => {
    const cuotas = [cuota(INICIO, ars(100)), cuota(dia(2031, 7), ars(150))];
    expect(
      lineas({ modalidad: "mensual", cuotas, fecha: dia(2031, 6, 30) }),
    ).toEqual(["ARS 200/0/200"]);
    expect(
      lineas({ modalidad: "mensual", cuotas, fecha: dia(2031, 8, 3) }),
    ).toEqual(["ARS 500/0/500"]);
  });

  test("dos ajustes del mismo mes: vale el último cargado", () => {
    const cuotas = [
      cuota(INICIO, ars(100)),
      cuota(dia(2031, 6), ars(150)),
      cuota(dia(2031, 6), ars(120)),
    ];
    expect(cuotaDelMes(cuotas, dia(2031, 6))).toEqual(ars(120));
    expect(lineas({ modalidad: "mensual", cuotas })).toEqual(["ARS 340/0/340"]);
  });

  test("la cuota de un mes es la del ajuste de mes más cercano anterior o igual, aunque se haya cargado antes que otro de un mes previo", () => {
    const cuotas = [
      cuota(INICIO, ars(100)),
      cuota(dia(2031, 9), ars(300)),
      cuota(dia(2031, 8), ars(200)),
    ];
    expect(cuotaDelMes(cuotas, dia(2031, 7))).toEqual(ars(100));
    expect(cuotaDelMes(cuotas, dia(2031, 8))).toEqual(ars(200));
    expect(cuotaDelMes(cuotas, dia(2031, 10))).toEqual(ars(300));
    expect(cuotaDelMes(cuotas, dia(2031, 4))).toBeNull();
  });

  test("tiene como tope el total de la orden de compra", () => {
    expect(
      lineas({
        modalidad: "mensual",
        cuotas: [cuota(INICIO, ars(400))],
        facturas: [ars(400)],
      }),
    ).toEqual(["ARS 1000/400/600"]);
  });

  test("sin orden de compra no hay tope", () => {
    expect(
      lineas({
        modalidad: "mensual",
        orden: null,
        cuotas: [cuota(INICIO, ars(400))],
      }),
    ).toEqual(["ARS 1200/0/1200"]);
  });

  test("atraviesa el fin de año", () => {
    expect(
      lineas({
        modalidad: "mensual",
        orden: null,
        cuotas: [cuota(dia(2031, 11), ars(100))],
        fecha: dia(2032, 2, 29),
      }),
    ).toEqual(["ARS 400/0/400"]);
  });
});

test("sin modalidad no devenga nada", () => {
  expect(
    lineas({ estado: "finalizado", facturas: [ars(100)], cuotas: [] }),
  ).toEqual(["ARS 0/100/-100"]);
});

describe("en qué etapa se factura con cada modalidad", () => {
  const ETAPAS: Readonly<
    Record<ModalidadDeFacturacion, readonly EstadoServicio[]>
  > = {
    puntual: ["finalizado"],
    por_hitos: ["adjudicado", "en_ejecucion", "finalizado"],
    mensual: ["en_ejecucion", "finalizado"],
  };

  test.each(
    MODALIDADES_DE_FACTURACION.flatMap((modalidad) =>
      ESTADOS_SERVICIO.map((estado) => [modalidad, estado] as const),
    ),
  )("%s en %s", (modalidad, estado) => {
    expect(admiteFactura(estado, modalidad)).toBe(
      ETAPAS[modalidad].includes(estado),
    );
  });
});

// Propiedades: al menos 1000 corridas cada una, o las de la configuración si son más.
const parametros = <Ts>() => {
  const base = configuracion<Ts>();
  return { ...base, numRuns: Math.max(1000, base.numRuns ?? 0) };
};

const indiceDeMes = (fecha: FechaHora) => fecha.anio * 12 + fecha.mes - 1;

/** Un mes entre 2030 y 2034, como su primer día. */
const mesArbitrario = fc
  .integer({ min: 0, max: 59 })
  .map((salto) => sumarMeses(dia(2030, 1), salto));

const monedaArbitraria = fc.constantFrom(...MONEDAS);

const importeEn = (moneda: Moneda, maximo = 1_000_000n) =>
  fc
    .bigInt({ min: 1n, max: maximo })
    .map((centavos) => crearImporte(centavos, moneda));

const importeArbitrario = monedaArbitraria.chain((moneda) => importeEn(moneda));

describe("propiedades", () => {
  test("con cualquier secuencia de ajustes (desde el mes actual en adelante), el devengado mensual de un mes pasado no cambia", () => {
    const caso = fc
      .record({
        inicio: mesArbitrario,
        // El mes actual: al menos uno después del inicio, así hay un mes pasado.
        actualDesdeInicio: fc.integer({ min: 1, max: 30 }),
        moneda: monedaArbitraria,
        conOrden: fc.boolean(),
        estado: fc.constantFrom(...ESTADOS_SERVICIO),
      })
      .chain(({ inicio, actualDesdeInicio, moneda, conOrden, estado }) => {
        const actual = sumarMeses(inicio, actualDesdeInicio);
        return fc.record({
          inicio: fc.constant(inicio),
          moneda: fc.constant(moneda),
          estado: fc.constant(estado),
          orden: conOrden ? importeEn(moneda, 50_000_000n) : fc.constant(null),
          pasado: fc
            .integer({ min: 0, max: actualDesdeInicio - 1 })
            .map((salto) => sumarMeses(inicio, salto)),
          inicial: importeEn(moneda),
          // Ajustes que ya estaban: cualquier mes desde el inicio.
          previos: fc.array(
            fc.record({
              desde: fc
                .integer({ min: 0, max: actualDesdeInicio + 12 })
                .map((salto) => sumarMeses(inicio, salto)),
              importe: importeEn(moneda),
            }),
            { maxLength: 4 },
          ),
          // Los que se cargan después: desde el mes actual en adelante.
          nuevos: fc.array(
            fc.record({
              desde: fc
                .integer({ min: 0, max: 24 })
                .map((salto) => sumarMeses(actual, salto)),
              importe: importeEn(moneda),
            }),
            { minLength: 1, maxLength: 6 },
          ),
          facturas: fc.array(importeEn(moneda), { maxLength: 3 }),
        });
      });
    fc.assert(
      fc.property(caso, (c) => {
        const antes: readonly Cuota[] = [
          cuota(c.inicio, c.inicial),
          ...c.previos,
        ];
        const finDelMes = dia(
          c.pasado.anio,
          c.pasado.mes,
          ultimoDiaDelMes(c.pasado.anio, c.pasado.mes),
        );
        const datos = {
          modalidad: "mensual",
          estado: c.estado,
          orden: c.orden,
          facturas: c.facturas,
          fecha: finDelMes,
        } as const;
        expect(
          devengadoPorMoneda({ ...datos, cuotas: [...antes, ...c.nuevos] }),
        ).toEqual(devengadoPorMoneda({ ...datos, cuotas: antes }));
      }),
      parametros(),
    );
  });

  test("el devengado mensual nunca supera el total de la orden de compra", () => {
    const caso = monedaArbitraria.chain((moneda) =>
      fc.record({
        orden: importeEn(moneda, 20_000_000n),
        inicio: mesArbitrario,
        cuotas: fc.array(
          fc.record({ desde: mesArbitrario, importe: importeEn(moneda) }),
          { maxLength: 5 },
        ),
        fecha: mesArbitrario.chain((mes) =>
          fc
            .integer({ min: 1, max: ultimoDiaDelMes(mes.anio, mes.mes) })
            .map((numero) => dia(mes.anio, mes.mes, numero)),
        ),
        inicial: importeEn(moneda),
        facturas: fc.array(importeArbitrario, { maxLength: 3 }),
        estado: fc.constantFrom(...ESTADOS_SERVICIO),
      }),
    );
    fc.assert(
      fc.property(caso, (c) => {
        const desdeElInicio = c.cuotas.filter(
          ({ desde }) => indiceDeMes(desde) >= indiceDeMes(c.inicio),
        );
        const linea = devengadoPorMoneda({
          modalidad: "mensual",
          estado: c.estado,
          orden: c.orden,
          facturas: c.facturas,
          cuotas: [cuota(c.inicio, c.inicial), ...desdeElInicio],
          fecha: c.fecha,
        }).find(({ moneda }) => moneda === c.orden.moneda);
        expect(linea).toBeDefined();
        expect(linea?.devengado.centavos ?? 0n).toBeLessThanOrEqual(
          c.orden.centavos,
        );
        expect(linea?.devengado.centavos ?? -1n).toBeGreaterThanOrEqual(0n);
      }),
      parametros(),
    );
  });

  const datosArbitrarios = (
    modalidades: readonly (ModalidadDeFacturacion | null)[],
  ) =>
    fc.record({
      modalidad: fc.constantFrom(...modalidades),
      estado: fc.constantFrom(...ESTADOS_SERVICIO),
      orden: fc.option(importeArbitrario, { nil: null }),
      facturas: fc.array(importeArbitrario, { maxLength: 6 }),
      cuotas: monedaArbitraria.chain((moneda) =>
        fc.array(
          fc.record({ desde: mesArbitrario, importe: importeEn(moneda) }),
          { maxLength: 4 },
        ),
      ),
      fecha: mesArbitrario,
    });

  test("en puntual, mensual y sin modalidad: por facturar = devengado − facturado, por moneda", () => {
    fc.assert(
      fc.property(
        datosArbitrarios(["puntual", "mensual", null]),
        (datos: DatosDevengado) => {
          for (const linea of devengadoPorMoneda(datos)) {
            const facturado = datos.facturas
              .filter(({ moneda }) => moneda === linea.moneda)
              .reduce((suma, { centavos }) => suma + centavos, 0n);
            expect(linea.facturado.centavos).toBe(facturado);
            expect(linea.porFacturar).toEqual(
              crearImporte(linea.devengado.centavos - facturado, linea.moneda),
            );
          }
        },
      ),
      parametros(),
    );
  });

  test("en por hitos: por facturar = saldo de la orden de compra, y devengado = facturado", () => {
    fc.assert(
      fc.property(datosArbitrarios(["por_hitos"]), (datos: DatosDevengado) => {
        for (const linea of devengadoPorMoneda(datos)) {
          const facturado = datos.facturas
            .filter(({ moneda }) => moneda === linea.moneda)
            .reduce((suma, { centavos }) => suma + centavos, 0n);
          const saldoDeLaOrden =
            datos.orden?.moneda === linea.moneda
              ? datos.orden.centavos - facturado
              : 0n;
          expect(linea.devengado.centavos).toBe(facturado);
          expect(linea.porFacturar).toEqual(
            crearImporte(saldoDeLaOrden, linea.moneda),
          );
        }
      }),
      parametros(),
    );
  });
});
