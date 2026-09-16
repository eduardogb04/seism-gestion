/**
 * Prueba negativa (y positiva) de `npm run nombres-prohibidos`:
 * `tests/fixtures/nombres-prohibidos/debe-fallar.md` TIENE que ser
 * rechazado (trae el término ficticio de prueba, ver
 * `scripts/lib/nombres-prohibidos-datos.ts`) y `debe-pasar.md` — el mismo
 * texto sin ese término — TIENE que ser aceptado: si también lo rechazara,
 * el control tendría falsos positivos. Este script corre la misma detección
 * que `scripts/nombres-prohibidos.ts` sobre los dos archivos e **invierte**
 * el código de salida: 0 si cada uno se comportó como se espera, 1 si
 * alguno no.
 *
 * `npm run nombres-prohibidos` (el control normal) excluye
 * `tests/fixtures/nombres-prohibidos/`, así que estos archivos nunca frenan
 * una tarea real.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { encontrarCoincidencias } from "./lib/deteccion-nombres.ts";
import { TERMINOS_PROHIBIDOS } from "./lib/nombres-prohibidos-datos.ts";

const DIR_FIXTURES = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "nombres-prohibidos",
);

interface CasoFixture {
  readonly archivo: string;
  readonly tieneQueSerRechazado: boolean;
}

const CASOS: readonly CasoFixture[] = [
  { archivo: "debe-fallar.md", tieneQueSerRechazado: true },
  { archivo: "debe-pasar.md", tieneQueSerRechazado: false },
];

function main(): void {
  let todoBien = true;

  for (const caso of CASOS) {
    const ruta = path.join(DIR_FIXTURES, caso.archivo);
    const contenido = readFileSync(ruta, "utf8");
    const coincidencias = encontrarCoincidencias(
      contenido,
      TERMINOS_PROHIBIDOS,
    );
    const fueRechazado = coincidencias.length > 0;

    console.log(`--- tests/fixtures/nombres-prohibidos/${caso.archivo} ---`);
    for (const { linea, hash } of coincidencias) {
      console.log(`  línea ${linea}: hash ${hash.slice(0, 12)}…`);
    }

    if (fueRechazado === caso.tieneQueSerRechazado) {
      const que = caso.tieneQueSerRechazado ? "rechazado" : "aceptado";
      console.log(`OK: '${caso.archivo}' fue ${que}, como se esperaba.\n`);
      continue;
    }

    todoBien = false;
    if (caso.tieneQueSerRechazado) {
      console.error(
        `\nERROR: '${caso.archivo}' fue ACEPTADO. El control no lo está rechazando.\n`,
      );
    } else {
      console.error(
        `\nERROR: '${caso.archivo}' fue RECHAZADO. Es el caso permitido: falso positivo.\n`,
      );
    }
  }

  if (todoBien) {
    console.log(
      "nombres-prohibidos:fixtures: los dos fixtures se comportaron como se esperaba. Todo bien.",
    );
    process.exit(0);
  }

  console.error(
    "nombres-prohibidos:fixtures: al menos un fixture no se comportó como se esperaba. " +
      "Revisá scripts/lib/deteccion-nombres.ts y scripts/lib/nombres-prohibidos-datos.ts.",
  );
  process.exit(1);
}

main();
