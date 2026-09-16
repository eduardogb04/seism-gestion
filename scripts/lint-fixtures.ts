/**
 * Prueba negativa de `npm run lint`: cada fixture de `tests/fixtures/lint/`
 * TIENE que ser rechazado por Biome, y por reglas precisas. Este script corre
 * Biome sobre cada uno **por separado** (con `cwd` en su carpeta, para que
 * tome la configuración de ahí), imprime la salida de error (así se ve que
 * rechaza a propósito) e **invierte** el código de salida: 0 si cada fixture
 * fue rechazado por las reglas esperadas, desde los archivos esperados y
 * **sin** tocar los archivos permitidos; 1 si alguno fue aceptado, si falta
 * un diagnóstico o si aparece uno donde no correspondía.
 *
 * Son dos fixtures, y prueban cosas distintas:
 *
 * - `debe-fallar.ts` (F0-02): dos reglas independientes (`noExplicitAny` y
 *   `noUnusedVariables`), para que el rechazo de una no tape que la otra dejó
 *   de funcionar. Vive en la raíz de `tests/fixtures/lint/`, con la
 *   configuración propia de esa carpeta (`"root": true`, no hereda nada: el
 *   `biome.json` de la raíz excluye `tests/fixtures/` del lint normal —
 *   decisión F0-02).
 * - `reloj-inyectado/` (F0-18): la regla del reloj, que marca la global
 *   `Date` **solo** dentro de `src/dominio/**`. Su `biome.json` sí
 *   **extiende** el de la raíz, y replica la estructura `src/...` para que la
 *   regla por ruta le aplique: así el fixture prueba la regla de verdad, no
 *   una copia. Si alguien la saca de `biome.json`, el fixture pasa el lint y
 *   este script se pone en rojo. Trae además el caso permitido
 *   (`src/adaptadores/`), que prueba que la regla no se pasó de alcance:
 *   traducir entre la fecha del sistema y el dominio es trabajo del borde.
 *
 * Biome no expone una API de Node: se invoca su CLI (el mismo script que usa
 * `node_modules/.bin/biome`, que resuelve el binario nativo según la
 * plataforma) como subproceso.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { stripVTControlCharacters } from "node:util";

const require = createRequire(import.meta.url);

const RAIZ = process.cwd();
const DIR_FIXTURES = path.join(RAIZ, "tests", "fixtures", "lint");

/** Cabecera de un diagnóstico: `<archivo>:<línea>:<columna> lint/<regla>`. */
const LINEA_DIAGNOSTICO = /^(\S+):\d+:\d+\s+(lint\/[\w/]+)/;

interface Fixture {
  /** Carpeta del fixture, relativa a `tests/fixtures/lint/` (`"."` es la raíz). */
  readonly carpeta: string;
  /** Qué se le pasa a `biome check`: un archivo o una carpeta. */
  readonly objetivo: string;
  /** Reglas que tienen que aparecer, todas, en la salida. */
  readonly reglasEsperadas: readonly string[];
  /** Archivos (relativos al fixture) que tienen que aparecer como violación. */
  readonly archivosQueViolan: readonly string[];
  /** Archivos que NO tienen que aparecer: son el caso permitido. */
  readonly archivosPermitidos: readonly string[];
}

const FIXTURES: readonly Fixture[] = [
  {
    carpeta: ".",
    objetivo: "debe-fallar.ts",
    reglasEsperadas: [
      "lint/suspicious/noExplicitAny",
      "lint/correctness/noUnusedVariables",
    ],
    archivosQueViolan: ["debe-fallar.ts"],
    archivosPermitidos: [],
  },
  {
    carpeta: "reloj-inyectado",
    objetivo: "src",
    reglasEsperadas: ["lint/style/noRestrictedGlobals"],
    archivosQueViolan: ["src/dominio/usa-date.ts"],
    archivosPermitidos: ["src/adaptadores/reloj/usa-date.ts"],
  },
];

interface Diagnostico {
  readonly archivo: string;
  readonly regla: string;
}

function extraerDiagnosticos(salida: string): Diagnostico[] {
  const diagnosticos: Diagnostico[] = [];
  for (const linea of salida.split(/\r?\n/)) {
    const coincidencia = LINEA_DIAGNOSTICO.exec(linea);
    if (coincidencia?.[1] !== undefined && coincidencia[2] !== undefined) {
      diagnosticos.push({
        // Biome imprime las rutas con el separador de la plataforma.
        archivo: coincidencia[1].split("\\").join("/"),
        regla: coincidencia[2],
      });
    }
  }
  return diagnosticos;
}

/** Corre Biome sobre un fixture y devuelve los errores hallados. */
function chequearFixture(fixture: Fixture): string[] {
  const biomeBin = require.resolve("@biomejs/biome/bin/biome");
  const resultado = spawnSync(
    process.execPath,
    [biomeBin, "check", fixture.objetivo],
    {
      cwd: path.join(DIR_FIXTURES, fixture.carpeta),
      encoding: "utf8",
    },
  );
  if (resultado.error !== undefined) {
    throw resultado.error;
  }

  const salida = stripVTControlCharacters(
    `${resultado.stdout ?? ""}${resultado.stderr ?? ""}`,
  );
  console.log(salida.replace(/^(\r?\n)+/, "").trimEnd());

  if (resultado.status === 0) {
    return ["el fixture fue ACEPTADO: el lint no lo está rechazando."];
  }

  const diagnosticos = extraerDiagnosticos(salida);
  const errores: string[] = [];

  const reglasFaltantes = fixture.reglasEsperadas.filter(
    (regla) => !diagnosticos.some((diagnostico) => diagnostico.regla === regla),
  );
  if (reglasFaltantes.length > 0) {
    errores.push(
      `falta el diagnóstico de: ${reglasFaltantes.join(", ")}. Un rechazo no puede tapar al otro.`,
    );
  }

  const archivosConDiagnostico = new Set(
    diagnosticos.map((diagnostico) => diagnostico.archivo),
  );
  const faltantes = fixture.archivosQueViolan.filter(
    (archivo) => !archivosConDiagnostico.has(archivo),
  );
  if (faltantes.length > 0) {
    errores.push(
      `estos archivos tenían que ser rechazados y no aparecen: ${faltantes.join(", ")}.`,
    );
  }

  const permitidosRechazados = fixture.archivosPermitidos.filter((archivo) =>
    archivosConDiagnostico.has(archivo),
  );
  if (permitidosRechazados.length > 0) {
    errores.push(
      `estos archivos son el caso permitido y aparecen como violación (la regla se pasó de alcance): ${permitidosRechazados.join(", ")}.`,
    );
  }

  return errores;
}

function main(): void {
  let todoBien = true;

  for (const fixture of FIXTURES) {
    const nombre =
      fixture.carpeta === "."
        ? `tests/fixtures/lint/${fixture.objetivo}`
        : `tests/fixtures/lint/${fixture.carpeta}/`;
    console.log(`--- ${nombre} ---`);
    const errores = chequearFixture(fixture);

    if (errores.length === 0) {
      console.log(
        `\nOK: '${nombre}' fue rechazado por Biome con las reglas esperadas (${fixture.reglasEsperadas.join(", ")}), como se esperaba.\n`,
      );
    } else {
      for (const error of errores) {
        console.error(`\nERROR (${nombre}): ${error}`);
      }
      console.error("");
      todoBien = false;
    }
  }

  if (todoBien) {
    console.log(
      `lint:fixtures: los ${FIXTURES.length} fixtures fueron rechazados a propósito, cada uno por sus reglas. Todo bien.`,
    );
    process.exit(0);
  }

  console.error(
    "lint:fixtures: al menos un fixture no fue rechazado como se esperaba. " +
      "Revisá biome.json y tests/fixtures/lint/.",
  );
  process.exit(1);
}

main();
