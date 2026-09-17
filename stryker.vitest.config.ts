/**
 * Config de Vitest exclusiva para Stryker (F0-17). Un solo proyecto: el
 * nivel `dominio`, igual que el proyecto homónimo de `vitest.config.ts`
 * (mismo `include`, mismo arnés sin red).
 *
 * Separada a propósito, en vez de apuntar Stryker a `vitest.config.ts`:
 * ese archivo declara tres proyectos (`dominio`, `casos-uso`, `extraccion`)
 * y Stryker (P2, solo dominio) no necesita que sus sandboxes carguen el
 * `globalSetup` de `casos-uso` (Testcontainers) ni nada de `extraccion`.
 * Si el proyecto `dominio` cambia en `vitest.config.ts`, replicar el cambio
 * acá.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/dominio/**/*.test.ts"],
    setupFiles: ["tests/dominio/_arnes/sin-red.ts"],
  },
});
