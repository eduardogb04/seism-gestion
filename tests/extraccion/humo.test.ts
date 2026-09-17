import { describe, expect, it } from "vitest";

/**
 * F0-14: el nivel **extracción** existe y corre (`vitest --project
 * extraccion`). Como el test de humo del dominio en F0-01, esto solo confirma
 * que la tanda tiene algo que correr. El arnés de golden files
 * (`compararConGolden`, `npm run test:golden:update`) ya existe desde F0-16
 * (`_arnes/golden.ts`, con su caso de ejemplo en `ejemplo.test.ts`); los
 * casos reales de extracción de documentos son Fase 1.
 */
describe("humo", () => {
  it("el arnés de tests de extracción corre", () => {
    expect(1 + 1).toBe(2);
  });
});
