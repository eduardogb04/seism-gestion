/**
 * Los niveles de test (F0-14). Tres de los cuatro son proyectos de Vitest,
 * cada uno con su configuración; el cuarto, el e2e, lo corre Playwright con su
 * propio archivo (`playwright.config.ts`), porque un `.spec.ts` de Playwright
 * no lo puede ejecutar Vitest. El porqué, en docs/adr/0014-niveles-de-test.md.
 *
 * | Proyecto     | Qué corre                        | Qué necesita        |
 * |--------------|----------------------------------|---------------------|
 * | `dominio`    | `tests/dominio/**`               | nada: sin red ni base |
 * | `casos-uso`  | `tests/casos-uso/**`             | Docker (un Postgres para toda la tanda) |
 * | `extraccion` | `tests/extraccion/**`            | nada (golden files, F0-16) |
 *
 *   npm test                → `dominio` y `casos-uso` (el ciclo de siempre)
 *   npm run test:dominio    → solo `dominio`, con el tope de 10 s de F0-14
 *   npm run test:extraccion → solo `extraccion`
 *   npm run test:e2e        → Playwright
 *   npm run test:todo       → los cuatro niveles
 *
 * `tests/fixtures/` nunca corre como test: son archivos que otras herramientas
 * tienen que rechazar, y no los toma ningún `include` de acá.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "dominio",
          include: ["tests/dominio/**/*.test.ts"],
          // El arnés que corta la red: un test de dominio que abre un socket
          // falla (tests/dominio/_arnes/sin-red.ts).
          setupFiles: ["tests/dominio/_arnes/sin-red.ts"],
        },
      },
      {
        test: {
          name: "casos-uso",
          include: ["tests/casos-uso/**/*.test.ts"],
          // Un solo Postgres para toda la tanda: lo levanta este globalSetup
          // (una vez), lo comparten los archivos de test y lo destruye al
          // terminar (tests/casos-uso/_arnes/contenedor.ts).
          globalSetup: ["tests/casos-uso/_arnes/contenedor.ts"],
          // Los archivos comparten ese contenedor y su base migrada: corren
          // de a uno, así `limpiarBase()` no le borra las filas a otro test.
          fileParallelism: false,
          // Levantar un contenedor y aplicar migraciones tarda más que un
          // test de dominio.
          testTimeout: 120_000,
          hookTimeout: 180_000,
        },
      },
      {
        test: {
          name: "extraccion",
          include: ["tests/extraccion/**/*.test.ts"],
        },
      },
    ],
  },
});
