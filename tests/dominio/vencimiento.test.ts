/**
 * La regla de vencimiento (F4-01, ADR 0043): de la fecha de finalización, la
 * regla del tipo de servicio y el camión, si hay, sale la fecha de vencimiento
 * o «no vence» (`null`). Casos con nombre y las cuatro propiedades de la spec.
 */

import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  crearFechaHora,
  diferenciaEnDias,
  type FechaHora,
  sumarDias,
  sumarMeses,
} from "../../src/dominio/compartido/reloj.ts";
import {
  fechaDeVencimiento,
  type ReglaDeVencimiento,
} from "../../src/dominio/servicios/vencimiento.ts";
import { configuracion } from "./_arnes/propiedad.ts";

function dia(anio: number, mes: number, numero: number): FechaHora {
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

const SOLO_COMUN: ReglaDeVencimiento = {
  vencimientoMeses: 12,
  vencimientoMesesAntiguos: null,
  antiguedadCorteAnios: null,
};

const DE_CAMIONES: ReglaDeVencimiento = {
  vencimientoMeses: 60,
  vencimientoMesesAntiguos: 36,
  antiguedadCorteAnios: 10,
};

const SIN_PLAZO: ReglaDeVencimiento = {
  vencimientoMeses: null,
  vencimientoMesesAntiguos: null,
  antiguedadCorteAnios: null,
};

describe("fechaDeVencimiento: casos", () => {
  test("suma el plazo común en meses a la finalización", () => {
    expect(fechaDeVencimiento(dia(2031, 3, 15), SOLO_COMUN, null)).toEqual(
      dia(2032, 3, 15),
    );
  });

  test("31 de enero + 1 mes es el 28 de febrero, y el 29 en año bisiesto", () => {
    const unMes = { ...SIN_PLAZO, vencimientoMeses: 1 };
    expect(fechaDeVencimiento(dia(2031, 1, 31), unMes, null)).toEqual(
      dia(2031, 2, 28),
    );
    expect(fechaDeVencimiento(dia(2032, 1, 31), unMes, null)).toEqual(
      dia(2032, 2, 29),
    );
  });

  test("del 29 de febrero, 12 meses después cae el 28 de febrero", () => {
    expect(fechaDeVencimiento(dia(2032, 2, 29), SOLO_COMUN, null)).toEqual(
      dia(2033, 2, 28),
    );
  });

  test("sin plazo no vence", () => {
    expect(fechaDeVencimiento(dia(2031, 3, 15), SIN_PLAZO, null)).toBeNull();
  });

  test("un camión de más antigüedad que el corte, a la fecha de finalización, usa el plazo de antiguos", () => {
    // 2031 − 2020 = 11 años: más que el corte de 10.
    expect(
      fechaDeVencimiento(dia(2031, 1, 2), DE_CAMIONES, {
        anioTractor: 2020,
        anioCisterna: null,
      }),
    ).toEqual(dia(2034, 1, 2));
  });

  test("con la antigüedad igual al corte usa el plazo común", () => {
    expect(
      fechaDeVencimiento(dia(2031, 12, 31), DE_CAMIONES, {
        anioTractor: 2021,
        anioCisterna: null,
      }),
    ).toEqual(dia(2036, 12, 31));
  });

  test("manda el año de la cisterna si la tiene, no el del tractor", () => {
    // Tractor viejo (2000) con cisterna nueva (2028): cuenta la cisterna.
    expect(
      fechaDeVencimiento(dia(2031, 5, 10), DE_CAMIONES, {
        anioTractor: 2000,
        anioCisterna: 2028,
      }),
    ).toEqual(dia(2036, 5, 10));
    // Tractor nuevo con cisterna vieja: también cuenta la cisterna.
    expect(
      fechaDeVencimiento(dia(2031, 5, 10), DE_CAMIONES, {
        anioTractor: 2029,
        anioCisterna: 2015,
      }),
    ).toEqual(dia(2034, 5, 10));
  });

  test("sin camión usa el plazo común aunque la regla tenga el de antiguos", () => {
    expect(fechaDeVencimiento(dia(2031, 5, 10), DE_CAMIONES, null)).toEqual(
      dia(2036, 5, 10),
    );
  });
});

// Propiedades: al menos 1000 corridas cada una, o las de la configuración si son más.
const parametros = <Ts>() => {
  const base = configuracion<Ts>();
  return { ...base, numRuns: Math.max(1000, base.numRuns ?? 0) };
};

/** Un día cualquiera entre 2000 y 2099, a medianoche. */
const diaArbitrario = fc
  .integer({ min: 0, max: 36_500 })
  .map((salto) => sumarDias(dia(2000, 1, 1), salto));

const plazo = fc.integer({ min: 1, max: 240 });

const reglaArbitraria: fc.Arbitrary<ReglaDeVencimiento> = fc.record({
  vencimientoMeses: fc.option(plazo, { nil: null }),
  vencimientoMesesAntiguos: fc.option(plazo, { nil: null }),
  antiguedadCorteAnios: fc.option(fc.integer({ min: 1, max: 40 }), {
    nil: null,
  }),
});

/** Un camión cualquiera según el año de una finalización, con o sin cisterna. */
const camionArbitrario = fc.option(
  fc.record({
    anioTractor: fc.integer({ min: 1950, max: 2099 }),
    anioCisterna: fc.option(fc.integer({ min: 1950, max: 2099 }), {
      nil: null,
    }),
  }),
  { nil: null },
);

describe("fechaDeVencimiento: propiedades", () => {
  test("(a) el vencimiento nunca es anterior a la finalización", () => {
    fc.assert(
      fc.property(
        diaArbitrario,
        reglaArbitraria,
        camionArbitrario,
        (finalizacion, regla, camion) => {
          const vence = fechaDeVencimiento(finalizacion, regla, camion);
          return vence === null || diferenciaEnDias(vence, finalizacion) >= 0;
        },
      ),
      parametros(),
    );
  });

  test("(b) con el mismo plazo, una finalización posterior nunca da un vencimiento anterior", () => {
    fc.assert(
      fc.property(
        diaArbitrario,
        fc.integer({ min: 0, max: 400 }),
        plazo,
        (primera, dias, meses) => {
          const regla = { ...SIN_PLAZO, vencimientoMeses: meses };
          const antes = fechaDeVencimiento(primera, regla, null);
          const despues = fechaDeVencimiento(
            sumarDias(primera, dias),
            regla,
            null,
          );
          return (
            antes !== null &&
            despues !== null &&
            diferenciaEnDias(despues, antes) >= 0
          );
        },
      ),
      parametros(),
    );
  });

  test("(c) un camión de más antigüedad que el corte usa el plazo de antiguos, y uno de menos o igual, el común", () => {
    fc.assert(
      fc.property(
        diaArbitrario,
        plazo,
        plazo,
        fc.integer({ min: 1, max: 40 }),
        // La antigüedad del año que cuenta respecto del corte: alrededor de él, con el igual incluido.
        fc.integer({ min: -5, max: 5 }),
        fc.boolean(),
        fc.integer({ min: 1950, max: 2099 }),
        (finalizacion, comun, antiguos, corte, desvio, conCisterna, otro) => {
          const anioQueCuenta = finalizacion.anio - (corte + desvio);
          const camion = conCisterna
            ? { anioTractor: otro, anioCisterna: anioQueCuenta }
            : { anioTractor: anioQueCuenta, anioCisterna: null };
          const regla: ReglaDeVencimiento = {
            vencimientoMeses: comun,
            vencimientoMesesAntiguos: antiguos,
            antiguedadCorteAnios: corte,
          };
          const esperado = sumarMeses(
            finalizacion,
            desvio > 0 ? antiguos : comun,
          );
          expect(fechaDeVencimiento(finalizacion, regla, camion)).toEqual(
            esperado,
          );
        },
      ),
      parametros(),
    );
  });

  test("(d) sin plazo, no vence", () => {
    fc.assert(
      fc.property(
        diaArbitrario,
        reglaArbitraria,
        camionArbitrario,
        (finalizacion, regla, camion) => {
          // Sin ningún plazo, con cualquier camión; sin plazo común, sin camión.
          const sinComun = { ...regla, vencimientoMeses: null };
          return (
            fechaDeVencimiento(finalizacion, SIN_PLAZO, camion) === null &&
            fechaDeVencimiento(finalizacion, sinComun, null) === null
          );
        },
      ),
      parametros(),
    );
  });
});
