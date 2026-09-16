/**
 * La tanda de dominio, con su reloj (F0-14).
 *
 *   npm run test:dominio
 *
 * El criterio de la tarea es que "la tanda de dominio entera tarda segundos
 * (criterio: menos de 10 s)". Un número sin quién lo mida es una intención:
 * esto corre el proyecto `dominio` de Vitest, mide la corrida de punta a punta
 * (arranque de Vitest incluido) y **sale 1 si se pasa del tope**, con el
 * tiempo en pantalla. Así el día que un test de dominio se traiga una espera
 * de verdad, el rojo aparece acá y no en la intuición de alguien.
 *
 * Es el mismo comando en la máquina de cualquiera y en CI.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

/** El tope de F0-14 para la tanda de dominio entera. */
const TOPE_MS = 10_000;

/**
 * La CLI de Vitest por ruta, como hace `node_modules/.bin/vitest`: igual en
 * Windows y en Linux, sin depender de un shell.
 */
const BIN_VITEST = path.join(
  process.cwd(),
  "node_modules",
  "vitest",
  "vitest.mjs",
);

const inicio = Date.now();
const corrida = spawnSync(
  process.execPath,
  [BIN_VITEST, "run", "--project", "dominio"],
  { stdio: "inherit" },
);
const tardo = Date.now() - inicio;

const segundos = (tardo / 1000).toFixed(1);
console.log(
  `\nLa tanda de dominio tardó ${segundos} s (tope de F0-14: ${TOPE_MS / 1000} s).`,
);

if (corrida.error !== undefined) {
  console.error(`\nERROR: no se pudo correr Vitest: ${corrida.error.message}`);
  process.exit(1);
}
if (corrida.status !== 0) {
  process.exit(corrida.status ?? 1);
}
if (tardo > TOPE_MS) {
  console.error(
    `\nERROR: la tanda de dominio tardó ${segundos} s y el tope son ${TOPE_MS / 1000} s. El nivel dominio no habla con nada: si un test espera, es que se llevó algo que va en tests/casos-uso/ (AGENTS.md, sección Testing).`,
  );
  process.exit(1);
}
