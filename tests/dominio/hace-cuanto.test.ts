/**
 * `haceCuanto` (F0-26, R9): la edad de algo en el panel de salud, en texto
 * corto. Función pura: le llegan milisegundos, no una fecha.
 */

import { describe, expect, test } from "vitest";
import { haceCuanto } from "../../src/casos-uso/salud/hace-cuanto.ts";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

describe("haceCuanto", () => {
  test.each([
    [0, "hace < 1 min"],
    [59_999, "hace < 1 min"],
    [-5000, "hace < 1 min"],
    [MINUTO, "hace 1 min"],
    [5 * MINUTO + 59_000, "hace 5 min"],
    [59 * MINUTO + 59_999, "hace 59 min"],
    [HORA, "hace 1 h"],
    [3 * HORA + 30 * MINUTO, "hace 3 h"],
    [23 * HORA + 59 * MINUTO, "hace 23 h"],
    [DIA, "hace 1 día"],
    [DIA + 23 * HORA, "hace 1 día"],
    [3 * DIA, "hace 3 días"],
  ])("%d ms → %s", (ms, texto) => {
    expect(haceCuanto(ms)).toBe(texto);
  });
});
