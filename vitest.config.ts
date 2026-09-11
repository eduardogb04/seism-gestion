import { defineConfig } from "vitest/config";

/**
 * F0-01 solo tiene el nivel `dominio` (test de humo). Los otros niveles
 * (casos-uso, extraccion, e2e) y la configuración multi-proyecto llegan en
 * F0-14. `tests/fixtures/` nunca corre como test: son archivos que otras
 * herramientas tienen que rechazar.
 */
export default defineConfig({
  test: {
    include: ["tests/dominio/**/*.test.ts"],
    exclude: ["tests/fixtures/**", "node_modules/**"],
  },
});
