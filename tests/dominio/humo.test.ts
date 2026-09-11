import { describe, expect, it } from "vitest";

/**
 * Test trivial de F0-01: solo confirma que `npm test` tiene algo que correr
 * en el nivel dominio. Las reglas de negocio reales llegan en el lote 5.
 */
describe("humo", () => {
  it("el arnés de tests de dominio corre", () => {
    expect(1 + 1).toBe(2);
  });
});
