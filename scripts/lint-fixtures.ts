/**
 * Prueba negativa de `npm run lint`: `tests/fixtures/lint/debe-fallar.ts`
 * TIENE que ser rechazado por Biome, y por dos reglas independientes
 * (`noExplicitAny` y `noUnusedVariables`), para que el rechazo de una no
 * tape que la otra dejó de funcionar. Este script corre Biome sobre ese
 * fixture con la configuración propia de `tests/fixtures/lint/biome.json`
 * (el `biome.json` de la raíz excluye `tests/fixtures/` del lint normal —
 * decisión F0-02), imprime la salida de error de Biome (así se ve que
 * rechaza a propósito) e **invierte** el código de salida: 0 si Biome
 * rechazó el fixture y aparecen los diagnósticos de las dos reglas, 1 si lo
 * aceptó o si falta alguno de los dos diagnósticos.
 *
 * Biome no expone una API de Node: se invoca su CLI (el mismo script que
 * usa `node_modules/.bin/biome`, que resuelve el binario nativo según la
 * plataforma) como subproceso, con `cwd` en `tests/fixtures/lint/` para que
 * tome esa configuración en vez de la de la raíz.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);

const DIR_FIXTURE = path.join(process.cwd(), "tests", "fixtures", "lint");
const ARCHIVO_FIXTURE = "debe-fallar.ts";
const REGLAS_ESPERADAS = [
  "lint/suspicious/noExplicitAny",
  "lint/correctness/noUnusedVariables",
];

function main(): void {
  const biomeBin = require.resolve("@biomejs/biome/bin/biome");

  const resultado = spawnSync(
    process.execPath,
    [biomeBin, "check", ARCHIVO_FIXTURE],
    {
      cwd: DIR_FIXTURE,
      encoding: "utf8",
    },
  );

  const salida = `${resultado.stdout ?? ""}${resultado.stderr ?? ""}`;
  console.log(`--- tests/fixtures/lint/${ARCHIVO_FIXTURE} ---`);
  console.log(salida.trim());

  const fueRechazado = resultado.status !== 0;
  const reglasFaltantes = REGLAS_ESPERADAS.filter(
    (regla) => !salida.includes(regla),
  );

  if (fueRechazado && reglasFaltantes.length === 0) {
    console.log(
      `\nOK: '${ARCHIVO_FIXTURE}' fue rechazado por Biome con las dos reglas esperadas, como se esperaba.`,
    );
    process.exit(0);
  }

  if (!fueRechazado) {
    console.error(
      `\nERROR: '${ARCHIVO_FIXTURE}' fue ACEPTADO. El lint no lo está rechazando.`,
    );
  }
  if (reglasFaltantes.length > 0) {
    console.error(
      `\nERROR: falta el diagnóstico de: ${reglasFaltantes.join(", ")}. Un rechazo no puede tapar al otro.`,
    );
  }
  process.exit(1);
}

main();
