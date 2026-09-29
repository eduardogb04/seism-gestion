/**
 * Las cuentas de tiempo de la sesión (F0-31): `sumarSegundos` (el vencimiento
 * de 12 horas) y `milisegundosEntre` (la caché de 30 s). Funciones puras sobre
 * `FechaHora`: nivel dominio, con propiedades.
 */

import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  milisegundosEntre,
  sumarSegundos,
} from "../../src/casos-uso/sesion/tiempo.ts";
import {
  crearFechaHora,
  type FechaHora,
} from "../../src/dominio/compartido/reloj.ts";
import { propiedad } from "./_arnes/propiedad.ts";

function fecha(
  anio: number,
  mes: number,
  dia: number,
  hora: number,
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
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
}

const fechaArbitraria = fc
  .record({
    anio: fc.integer({ min: 2000, max: 2100 }),
    mes: fc.integer({ min: 1, max: 12 }),
    dia: fc.integer({ min: 1, max: 28 }),
    hora: fc.integer({ min: 0, max: 23 }),
    minuto: fc.integer({ min: 0, max: 59 }),
    segundo: fc.integer({ min: 0, max: 59 }),
    milisegundo: fc.integer({ min: 0, max: 999 }),
  })
  .map((partes) => {
    const resultado = crearFechaHora(partes);
    if (!resultado.ok) {
      throw new Error(resultado.mensaje);
    }
    return resultado.fechaHora;
  });

describe("sumarSegundos", () => {
  test("12 horas después de las 18:30 es el día siguiente a las 06:30, cruzando fin de año", () => {
    expect(sumarSegundos(fecha(2031, 12, 31, 18, 30), 12 * 3600)).toEqual(
      fecha(2032, 1, 1, 6, 30),
    );
  });

  test("conserva los milisegundos y resta con negativos", () => {
    expect(sumarSegundos(fecha(2031, 3, 1, 0, 0, 10, 250), -20)).toEqual(
      fecha(2031, 2, 28, 23, 59, 50, 250),
    );
  });

  test("propiedad: la distancia entre f y f + s segundos es s * 1000 ms", () => {
    propiedad(
      fechaArbitraria,
      fc.integer({ min: -200_000, max: 200_000 }),
      (inicio, segundos) =>
        milisegundosEntre(inicio, sumarSegundos(inicio, segundos)) ===
        segundos * 1000,
    );
  });
});

describe("milisegundosEntre", () => {
  test("de 23:59:59.999 a 00:00:00.000 del día siguiente hay 1 ms", () => {
    expect(
      milisegundosEntre(
        fecha(2031, 5, 14, 23, 59, 59, 999),
        fecha(2031, 5, 15, 0),
      ),
    ).toBe(1);
  });

  test("es antisimétrica", () => {
    propiedad(
      fechaArbitraria,
      fechaArbitraria,
      (a, b) => milisegundosEntre(a, b) === -milisegundosEntre(b, a),
    );
  });
});
