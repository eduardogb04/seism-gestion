import { describe, expect, it } from "vitest";
import {
  crearImporte,
  formatearImporte,
  formatearMonto,
} from "../../src/dominio/compartido/importe.ts";

/**
 * F0-20 · Formato de un importe para pantalla, en castellano (`USD 24.315,00`).
 * Vive en el dominio desde F2-03: el listado y el formulario del molde de ABM
 * son casos de uso y no pueden importar de `src/app`. Es una función pura:
 * nivel dominio. La ida y vuelta con el parseo está en `importe.test.ts`.
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
