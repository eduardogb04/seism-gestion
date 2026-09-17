/**
 * Regenera los golden files del nivel extracción **a propósito** (F0-16).
 *
 *   npm run test:golden:update
 *
 * Corre el proyecto `extraccion` de Vitest con `ACTUALIZAR_GOLDEN=si`: cada
 * `compararConGolden` de la corrida (`tests/extraccion/_arnes/golden.ts`)
 * escribe el archivo en lugar de compararlo y lo avisa en pantalla, en vez de
 * fallar. CI nunca corre este script: un golden que falta hace fallar
 * `npm run test:extraccion`, no lo crea.
 *
 * Revisá a mano el diff de `tests/extraccion/golden/` antes de commitear: es
 * la única red contra un cambio de golden que no era a propósito.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const BIN_VITEST = path.join(
  process.cwd(),
  "node_modules",
  "vitest",
  "vitest.mjs",
);

console.log(
  "Regenerando a propósito los golden files de tests/extraccion/golden/...\n",
);

const corrida = spawnSync(
  process.execPath,
  [BIN_VITEST, "run", "--project", "extraccion"],
  {
    stdio: "inherit",
    env: { ...process.env, ACTUALIZAR_GOLDEN: "si" },
  },
);

if (corrida.error !== undefined) {
  console.error(`\nERROR: no se pudo correr Vitest: ${corrida.error.message}`);
  process.exit(1);
}

if (corrida.status !== 0) {
  process.exit(corrida.status ?? 1);
}

console.log(
  "\nListo. Revisá el diff de tests/extraccion/golden/ antes de commitear.",
);
