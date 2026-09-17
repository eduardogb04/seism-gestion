/**
 * Mutation testing sobre el dominio (F0-17, DISENO cimiento 4, plan P2):
 * "es la única forma de saber si los tests sirven o solo dan verde".
 * Stryker, solo sobre `src/dominio/**`, con Vitest como motor de test
 * (`stryker.vitest.config.ts`, un único proyecto: `dominio`). Corre a mano
 * (`npm run test:mutacion`) y los lunes en `.github/workflows/mutacion.yml`,
 * fuera del check `ci`: informa, no bloquea merges. Decisiones y porqués en
 * el ADR 0017 (incluye por qué `vitest` está fijado en 4.1.11, no 5.x).
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  packageManager: "npm",
  testRunner: "vitest",
  vitest: {
    configFile: "stryker.vitest.config.ts",
  },
  mutate: ["src/dominio/**/*.ts"],
  reporters: ["html", "clear-text", "progress"],
  htmlReporter: {
    fileName: "reports/mutacion/index.html",
  },
  tempDirName: ".stryker-tmp",
  thresholds: {
    // Umbral PROVISORIO (F0-17, ADR 0017): 87.73 % en la corrida real del
    // 2026-09-16 sobre el dominio tal como está hoy (reloj, identificador,
    // historial; faltan importe -- F0-20 -- y origen/auditoría -- F0-22),
    // redondeado hacia abajo. El umbral inicial DEFINITIVO se fija en el
    // cierre del lote 5, sobre el dominio completo, y desde ahí solo sube:
    // nunca baja.
    high: 90,
    low: 70,
    break: 87,
  },
};
