import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  crearFechaHora,
  diferenciaEnDias,
  esAnterior,
  type FechaHora,
  formatearISO,
  parsearISO,
  RelojFijo,
  sumarAnios,
  sumarDias,
  sumarMeses,
} from "../../src/dominio/compartido/reloj.ts";
import { propiedad } from "./_arnes/propiedad.ts";

/**
 * F0-18: el reloj se inyecta y el dominio no llama nunca a la fecha del
 * sistema. Nivel dominio: puro, sin red, sin base y sin `Date` (que la regla
 * de Biome sobre `src/dominio/**` hace cumplir del lado del código; acá se
 * prueba el comportamiento).
 *
 * Las propiedades del final usan fast-check (F0-15, `docs/adr/0015-property-based.md`)
 * a través del helper `propiedad()`: mismas propiedades y mismos casos borde
 * (fecha bisiesta, 29 de febrero) que la versión anterior con generador
 * propio, solo cambia el motor que produce las entradas.
 */

/** Atajo de los tests: arma una fecha válida o rompe el test en el acto. */
function fecha(
  anio: number,
  mes: number,
  dia: number,
  hora = 0,
  minuto = 0,
  segundo = 0,
  milisegundo = 0,
): FechaHora {
  const resultado = crearFechaHora({
    anio,
    mes,
    dia,
    hora,
    minuto,
    segundo,
    milisegundo,
  });
  if (!resultado.ok) {
    throw new Error(`fecha inválida en el test: ${resultado.mensaje}`);
  }
  return resultado.fechaHora;
}

describe("crearFechaHora", () => {
  it("acepta una fecha y hora válidas y devuelve sus partes", () => {
    const resultado = crearFechaHora({
      anio: 2026,
      mes: 9,
      dia: 15,
      hora: 14,
      minuto: 30,
      segundo: 5,
      milisegundo: 250,
    });

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.fechaHora.anio).toBe(2026);
      expect(resultado.fechaHora.mes).toBe(9);
      expect(resultado.fechaHora.dia).toBe(15);
      expect(resultado.fechaHora.hora).toBe(14);
      expect(resultado.fechaHora.minuto).toBe(30);
      expect(resultado.fechaHora.segundo).toBe(5);
      expect(resultado.fechaHora.milisegundo).toBe(250);
    }
  });

  it("acepta el 29 de febrero de un año bisiesto", () => {
    expect(
      crearFechaHora({
        anio: 2024,
        mes: 2,
        dia: 29,
        hora: 0,
        minuto: 0,
        segundo: 0,
        milisegundo: 0,
      }).ok,
    ).toBe(true);
  });

  it("rechaza el 29 de febrero de un año no bisiesto", () => {
    const resultado = crearFechaHora({
      anio: 2026,
      mes: 2,
      dia: 29,
      hora: 0,
      minuto: 0,
      segundo: 0,
      milisegundo: 0,
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensaje).toContain("día");
    }
  });

  it.each([
    ["mes fuera de rango", { mes: 13 }],
    ["mes cero", { mes: 0 }],
    ["día fuera del mes", { mes: 4, dia: 31 }],
    ["día cero", { dia: 0 }],
    ["hora fuera de rango", { hora: 24 }],
    ["minuto fuera de rango", { minuto: 60 }],
    ["segundo fuera de rango", { segundo: 60 }],
    ["milisegundo fuera de rango", { milisegundo: 1000 }],
    ["año fuera de rango", { anio: 0 }],
    ["día con decimales", { dia: 15.5 }],
  ])("rechaza %s", (_caso, parcial) => {
    const resultado = crearFechaHora({
      anio: 2026,
      mes: 9,
      dia: 15,
      hora: 12,
      minuto: 0,
      segundo: 0,
      milisegundo: 0,
      ...parcial,
    });

    expect(resultado.ok).toBe(false);
  });
});

describe("formatearISO y parsearISO", () => {
  it("formatea con AAAA-MM-DDTHH:MM:SS.mmm, sin zona horaria", () => {
    expect(formatearISO(fecha(2026, 9, 15, 14, 30, 5, 250))).toBe(
      "2026-09-15T14:30:05.250",
    );
  });

  it("rellena con ceros a la izquierda", () => {
    expect(formatearISO(fecha(2026, 1, 2, 3, 4, 5, 6))).toBe(
      "2026-01-02T03:04:05.006",
    );
  });

  it("parsea lo que formatea", () => {
    const original = fecha(2024, 2, 29, 23, 59, 59, 999);
    const resultado = parsearISO(formatearISO(original));

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.fechaHora).toEqual(original);
    }
  });

  it.each([
    ["con sufijo de zona", "2026-09-15T14:30:05.250Z"],
    ["con desplazamiento", "2026-09-15T14:30:05.250-03:00"],
    ["sin milisegundos", "2026-09-15T14:30:05"],
    ["solo fecha", "2026-09-15"],
    ["sin ceros a la izquierda", "2026-9-15T14:30:05.250"],
    ["con espacio en vez de T", "2026-09-15 14:30:05.250"],
    ["fecha inexistente", "2026-02-29T00:00:00.000"],
    ["basura", "no es una fecha"],
    ["vacío", ""],
  ])("rechaza %s", (_caso, texto) => {
    expect(parsearISO(texto).ok).toBe(false);
  });
});

describe("esAnterior", () => {
  it("compara por fecha", () => {
    expect(esAnterior(fecha(2026, 9, 15), fecha(2026, 9, 16))).toBe(true);
    expect(esAnterior(fecha(2026, 9, 16), fecha(2026, 9, 15))).toBe(false);
  });

  it("compara también la hora del día", () => {
    expect(
      esAnterior(fecha(2026, 9, 15, 10), fecha(2026, 9, 15, 10, 0, 0, 1)),
    ).toBe(true);
  });

  it("una fecha no es anterior a sí misma", () => {
    expect(esAnterior(fecha(2026, 9, 15, 10), fecha(2026, 9, 15, 10))).toBe(
      false,
    );
  });
});

describe("sumarDias", () => {
  it("cruza el fin de mes", () => {
    expect(sumarDias(fecha(2026, 1, 31), 1)).toEqual(fecha(2026, 2, 1));
  });

  it("cruza el fin de año", () => {
    expect(sumarDias(fecha(2026, 12, 31), 1)).toEqual(fecha(2027, 1, 1));
  });

  it("resta con cantidades negativas", () => {
    expect(sumarDias(fecha(2026, 3, 1), -1)).toEqual(fecha(2026, 2, 28));
  });

  it("pasa por el 29 de febrero en un año bisiesto", () => {
    expect(sumarDias(fecha(2024, 2, 28), 1)).toEqual(fecha(2024, 2, 29));
  });

  it("conserva la hora del día", () => {
    expect(sumarDias(fecha(2026, 9, 15, 14, 30, 5, 250), 10)).toEqual(
      fecha(2026, 9, 25, 14, 30, 5, 250),
    );
  });
});

describe("sumarMeses", () => {
  it("recorta al último día del mes destino", () => {
    expect(sumarMeses(fecha(2026, 1, 31), 1)).toEqual(fecha(2026, 2, 28));
  });

  it("recorta al 29 de febrero en un año bisiesto", () => {
    expect(sumarMeses(fecha(2024, 1, 31), 1)).toEqual(fecha(2024, 2, 29));
  });

  it("cruza el fin de año hacia adelante y hacia atrás", () => {
    expect(sumarMeses(fecha(2026, 12, 15), 1)).toEqual(fecha(2027, 1, 15));
    expect(sumarMeses(fecha(2026, 1, 15), -1)).toEqual(fecha(2025, 12, 15));
  });
});

describe("sumarAnios", () => {
  it("el 29 de febrero más un año cae en el 28 de febrero", () => {
    expect(sumarAnios(fecha(2024, 2, 29), 1)).toEqual(fecha(2025, 2, 28));
  });

  it("el 29 de febrero más cuatro años sigue siendo 29 de febrero", () => {
    expect(sumarAnios(fecha(2024, 2, 29), 4)).toEqual(fecha(2028, 2, 29));
  });

  it("cualquier otra fecha conserva día, mes y hora", () => {
    expect(sumarAnios(fecha(2026, 9, 15, 8), 3)).toEqual(fecha(2029, 9, 15, 8));
  });
});

describe("diferenciaEnDias", () => {
  it("cuenta días civiles entre dos fechas", () => {
    expect(diferenciaEnDias(fecha(2026, 9, 25), fecha(2026, 9, 15))).toBe(10);
  });

  it("es negativa cuando la primera es anterior", () => {
    expect(diferenciaEnDias(fecha(2026, 9, 15), fecha(2026, 9, 25))).toBe(-10);
  });

  it("ignora la hora del día", () => {
    expect(
      diferenciaEnDias(fecha(2026, 9, 16, 0, 1), fecha(2026, 9, 15, 23, 59)),
    ).toBe(1);
  });

  it("cuenta el 29 de febrero", () => {
    expect(diferenciaEnDias(fecha(2024, 3, 1), fecha(2024, 2, 28))).toBe(2);
  });

  it("la misma fecha contra sí misma da +0, nunca -0", () => {
    const misma = fecha(2026, 9, 25);

    expect(Object.is(diferenciaEnDias(misma, misma), 0)).toBe(true);
  });
});

describe("RelojFijo", () => {
  it("devuelve siempre la misma fecha", () => {
    const reloj = RelojFijo(fecha(2026, 9, 15, 14, 30));

    expect(reloj.ahora()).toEqual(fecha(2026, 9, 15, 14, 30));
    expect(reloj.ahora()).toEqual(reloj.ahora());
  });

  it("dos relojes fijos distintos no se pisan", () => {
    const uno = RelojFijo(fecha(2026, 1, 1));
    const otro = RelojFijo(fecha(2027, 1, 1));

    expect(esAnterior(uno.ahora(), otro.ahora())).toBe(true);
  });
});

const ANIOS_BISIESTOS = [
  1904, 1996, 2000, 2004, 2020, 2024, 2096, 2104,
] as const;

function ultimoDiaComun(mes: number): number {
  if (mes === 2) {
    return 28;
  }
  return mes === 4 || mes === 6 || mes === 9 || mes === 11 ? 30 : 31;
}

/** Una fecha válida cualquiera; el 29/02 tiene su propia arbitraria abajo. */
const fechaArbitraria: fc.Arbitrary<FechaHora> = fc
  .integer({ min: 1, max: 12 })
  .chain((mes) =>
    fc.record({
      anio: fc.integer({ min: 1900, max: 2200 }),
      mes: fc.constant(mes),
      dia: fc.integer({ min: 1, max: ultimoDiaComun(mes) }),
      hora: fc.integer({ min: 0, max: 23 }),
      minuto: fc.integer({ min: 0, max: 59 }),
      segundo: fc.integer({ min: 0, max: 59 }),
      milisegundo: fc.integer({ min: 0, max: 999 }),
    }),
  )
  .map((partes) =>
    fecha(
      partes.anio,
      partes.mes,
      partes.dia,
      partes.hora,
      partes.minuto,
      partes.segundo,
      partes.milisegundo,
    ),
  );

/** Un 29 de febrero de alguno de los años bisiestos de la lista. */
const veintinueveDeFebreroArbitraria: fc.Arbitrary<FechaHora> = fc
  .constantFrom(...ANIOS_BISIESTOS)
  .map((anio) => fecha(anio, 2, 29));

/** Cualquier fecha válida, incluido a veces el 29 de febrero. */
const fechaOVeintinueveArbitraria = fc.oneof(
  fechaArbitraria,
  veintinueveDeFebreroArbitraria,
);

const diasArbitrarios = fc.integer({ min: -10_000, max: 10_000 });
const aniosArbitrarios = fc.integer({ min: -100, max: 100 });

describe("propiedades", () => {
  it("sumar y restar la misma cantidad de días devuelve la fecha original", () => {
    propiedad(fechaArbitraria, diasArbitrarios, (original, dias) => {
      expect(sumarDias(sumarDias(original, dias), -dias)).toEqual(original);
    });
  });

  it("diferenciaEnDias cuenta exactamente los días que se sumaron", () => {
    propiedad(fechaArbitraria, diasArbitrarios, (original, dias) => {
      expect(diferenciaEnDias(sumarDias(original, dias), original)).toBe(dias);
    });
  });

  it("diferenciaEnDias es antisimétrica", () => {
    // Sin negación: `-diferenciaEnDias(...)` puede dar `-0` cuando el
    // resultado es `+0` (mismo día), y `toBe`/`Object.is` distingue `-0` de
    // `0`. Sumar las dos llamadas tiene el mismo significado y no depende
    // del signo del cero (M-02).
    propiedad(fechaArbitraria, fechaArbitraria, (una, otra) => {
      expect(diferenciaEnDias(una, otra) + diferenciaEnDias(otra, una)).toBe(0);
    });
  });

  it("la suma de años nunca cambia el mes", () => {
    propiedad(
      fechaOVeintinueveArbitraria,
      aniosArbitrarios,
      (original, anios) => {
        expect(sumarAnios(original, anios).mes).toBe(original.mes);
      },
    );
  });

  it("la suma de años solo cambia el día cuando se parte del 29 de febrero", () => {
    propiedad(
      fechaOVeintinueveArbitraria,
      aniosArbitrarios,
      (original, anios) => {
        const resultado = sumarAnios(original, anios);

        if (resultado.dia !== original.dia) {
          expect({ mes: original.mes, dia: original.dia }).toEqual({
            mes: 2,
            dia: 29,
          });
          expect(resultado.dia).toBe(28);
        }
      },
    );
  });

  it("parsearISO acepta todo lo que formatearISO produce, y devuelve lo mismo", () => {
    propiedad(fechaArbitraria, (original) => {
      const resultado = parsearISO(formatearISO(original));

      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.fechaHora).toEqual(original);
      }
    });
  });

  it("esAnterior es coherente con el orden de los días", () => {
    propiedad(fechaArbitraria, fechaArbitraria, (una, otra) => {
      const dias = diferenciaEnDias(otra, una);

      if (dias !== 0) {
        expect(esAnterior(una, otra)).toBe(dias > 0);
      }
      expect(esAnterior(una, una)).toBe(false);
    });
  });
});
