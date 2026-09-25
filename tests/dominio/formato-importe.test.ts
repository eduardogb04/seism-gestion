import { describe, expect, it } from "vitest";
import {
  formatearImporte,
  formatearMonto,
} from "../../src/app/formato/importe.ts";
import { crearImporte } from "../../src/dominio/compartido/importe.ts";

/**
 * F0-20 · Formato de un importe para pantalla, en castellano (`USD 24.315,00`).
 * Vive fuera del dominio (`src/app/formato/`): es presentación, no regla de
 * negocio. Va en el nivel dominio porque es una función pura que no necesita
 * nada de afuera (AGENTS.md, *Dónde poner un test nuevo*). La ida y vuelta
 * con el parseo está en `importe.test.ts`.
 */

describe("formatearImporte: USD 24.315,00", () => {
  it.each([
    [2_431_500n, "USD", "USD 24.315,00"],
    [2_431_550n, "ARS", "ARS 24.315,50"],
    [123_456_789n, "ARS", "ARS 1.234.567,89"],
    [100_000n, "USD", "USD 1.000,00"],
    [99_999n, "USD", "USD 999,99"],
    [5n, "ARS", "ARS 0,05"],
    [0n, "ARS", "ARS 0,00"],
    [-2_431_500n, "USD", "USD -24.315,00"],
    [-5n, "USD", "USD -0,05"],
  ] as const)("%s centavos en %s → %j", (centavos, moneda, esperado) => {
    expect(formatearImporte(crearImporte(centavos, moneda))).toBe(esperado);
  });

  it("formatearMonto es lo mismo sin el código de moneda", () => {
    expect(formatearMonto(crearImporte(123_456_789n, "USD"))).toBe(
      "1.234.567,89",
    );
  });
});
