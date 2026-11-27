import { describe, expect, it } from "vitest";
import { etapaDeRenovacion } from "../../src/dominio/calendario/renovacion.ts";

describe("etapaDeRenovacion", () => {
  it.each([
    [61, null],
    [60, 60],
    [46, 60],
    [45, 45],
    [31, 45],
    [30, 30],
    [0, 30],
    [-5, 30],
  ])("a %i días la etapa es %s", (dias, etapa) => {
    expect(etapaDeRenovacion(dias)).toBe(etapa);
  });
});
