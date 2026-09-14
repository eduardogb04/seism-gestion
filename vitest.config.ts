import { defineConfig } from "vitest/config";

/**
 * Una sola tanda: `tests/dominio/` (F0-01) y `tests/casos-uso/` (F0-09, con
 * Postgres en contenedor: `npm test` necesita Docker corriendo). La separación
 * en niveles (extraccion, e2e) y la configuración multi-proyecto llegan en
 * F0-14. `tests/fixtures/` nunca corre como test: son archivos que otras
 * herramientas tienen que rechazar.
 */
export default defineConfig({
  test: {
    include: ["tests/dominio/**/*.test.ts", "tests/casos-uso/**/*.test.ts"],
    exclude: ["tests/fixtures/**", "node_modules/**"],
  },
});
