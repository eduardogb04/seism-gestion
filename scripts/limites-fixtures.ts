/**
 * Prueba negativa de `npm run limites`: cada carpeta de
 * `tests/fixtures/limites/` es un fixture que TIENE que ser rechazado por
 * dependency-cruiser, y por una regla precisa: la que le da nombre a la
 * carpeta. Hay un fixture por cada regla de `.dependency-cruiser.cjs` (las
 * de la tabla de límites, `no-circular` y `no-orphans`).
 *
 * Cada fixture replica la estructura `src/...` que hace falta para que las
 * reglas por ruta le apliquen, y trae archivos que violan la regla y otros
 * que no (el caso permitido, por ejemplo un `import type` del dominio desde
 * `app`). Este script corre dependency-cruiser sobre cada fixture **por
 * separado** (con `cwd` en su carpeta y la configuración de la raíz), imprime
 * su salida de error (así se ve que rechaza a propósito) e **invierte** el
 * código de salida: 0 si cada fixture fue rechazado por su regla y
 * exactamente desde los archivos esperados; 1 si alguno pasó, si lo rechazó
 * otra regla, si faltó o sobró algún archivo, o si hay una regla sin fixture
 * (o un fixture sin regla).
 *
 * El `limites` normal excluye `tests/fixtures/` (ver `options.exclude` en
 * `.dependency-cruiser.cjs`), así que estos archivos nunca frenan una tarea
 * real.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { stripVTControlCharacters } from "node:util";
import type { IConfiguration } from "dependency-cruiser";

const require = createRequire(import.meta.url);

const RAIZ = process.cwd();
const DIR_FIXTURES = path.join(RAIZ, "tests", "fixtures", "limites");
const RUTA_CONFIG = path.join(RAIZ, ".dependency-cruiser.cjs");
// El paquete no exporta su binario: se lo invoca por ruta, como hace
// `node_modules/.bin/depcruise`.
const BIN_DEPCRUISE = path.join(
  RAIZ,
  "node_modules",
  "dependency-cruiser",
  "bin",
  "dependency-cruise.mjs",
);

/** Una línea de violación del reporte `err`: `error <regla>: <desde> → ...`. */
const LINEA_VIOLACION = /^\s*(?:error|warn|info)\s+([a-z0-9-]+):\s+(\S+)/;

interface Fixture {
  /** Nombre de la regla, y de la carpeta del fixture. */
  readonly regla: string;
  /** Archivos del fixture (relativos a su carpeta) que tienen que violarla. */
  readonly archivosQueViolan: readonly string[];
}

const FIXTURES: readonly Fixture[] = [
  {
    regla: "dominio-puro",
    archivosQueViolan: [
      "src/dominio/importa-prisma.ts",
      "src/dominio/importa-zod.ts",
      "src/dominio/importa-node.ts",
      "src/dominio/importa-node-sin-prefijo.ts",
      "src/dominio/importa-otra-capa.ts",
    ],
  },
  {
    regla: "casos-uso-sin-afuera",
    archivosQueViolan: [
      "src/casos-uso/usa-adaptador.ts",
      "src/casos-uso/usa-prisma.ts",
      "src/casos-uso/usa-cliente-prisma-generado.ts",
      "src/casos-uso/usa-infraestructura.ts",
      "src/casos-uso/usa-app.ts",
      "src/casos-uso/usa-worker.ts",
    ],
  },
  {
    regla: "puertos-solo-dominio",
    archivosQueViolan: [
      "src/puertos/usa-caso-uso.ts",
      "src/puertos/usa-node.ts",
    ],
  },
  {
    regla: "adaptadores-sin-casos-uso-ni-entradas",
    archivosQueViolan: [
      "src/adaptadores/memoria/usa-caso-uso.ts",
      "src/adaptadores/memoria/usa-app.ts",
      "src/adaptadores/memoria/usa-worker.ts",
    ],
  },
  {
    regla: "adaptadores-solo-en-arranque",
    archivosQueViolan: [
      "src/app/usa-adaptador.ts",
      "src/app/page.tsx",
      "src/instrumentation.ts",
      "src/worker/usa-adaptador.ts",
      "src/infraestructura/log/usa-adaptador.ts",
    ],
  },
  {
    regla: "app-worker-dominio-solo-tipos",
    archivosQueViolan: [
      "src/app/escribe-dominio.ts",
      "src/app/import-mixto.ts",
      "src/instrumentation.ts",
      "src/worker/escribe-dominio.ts",
    ],
  },
  {
    // Un ciclo se reporta una vez, desde su primer módulo.
    regla: "no-circular",
    archivosQueViolan: ["src/dominio/a.ts"],
  },
  {
    regla: "no-orphans",
    // Los archivos especiales de Next (`src/app/page.tsx`,
    // `src/instrumentation.ts`) están sueltos pero exceptuados; un `.tsx`
    // con otro nombre, no.
    archivosQueViolan: ["src/casos-uso/huerfano.ts", "src/app/suelto.tsx"],
  },
];

interface Violacion {
  readonly regla: string;
  readonly desde: string;
}

function leerNombresDeReglas(): string[] {
  const config: IConfiguration = require(RUTA_CONFIG);
  return (config.forbidden ?? []).map((regla) => regla.name ?? "(sin nombre)");
}

/** Errores de cobertura: cada regla tiene su fixture y cada fixture su regla. */
function chequearCobertura(): string[] {
  const reglas = new Set(leerNombresDeReglas());
  const carpetas = new Set(
    readdirSync(DIR_FIXTURES, { withFileTypes: true })
      .filter((entrada) => entrada.isDirectory())
      .map((entrada) => entrada.name),
  );
  const declarados = new Set(FIXTURES.map((fixture) => fixture.regla));
  const errores: string[] = [];

  for (const regla of reglas) {
    if (!declarados.has(regla)) {
      errores.push(`la regla '${regla}' no tiene fixture.`);
    }
  }
  for (const regla of declarados) {
    if (!reglas.has(regla)) {
      errores.push(
        `el fixture '${regla}' no corresponde a ninguna regla de .dependency-cruiser.cjs.`,
      );
    }
    if (!carpetas.has(regla)) {
      errores.push(`falta la carpeta tests/fixtures/limites/${regla}/.`);
    }
  }
  for (const carpeta of carpetas) {
    if (!declarados.has(carpeta)) {
      errores.push(
        `la carpeta tests/fixtures/limites/${carpeta}/ no está declarada en este script.`,
      );
    }
  }
  return errores;
}

function extraerViolaciones(salida: string): Violacion[] {
  const violaciones: Violacion[] = [];
  for (const linea of salida.split(/\r?\n/)) {
    const coincidencia = LINEA_VIOLACION.exec(linea);
    if (coincidencia?.[1] !== undefined && coincidencia[2] !== undefined) {
      violaciones.push({ regla: coincidencia[1], desde: coincidencia[2] });
    }
  }
  return violaciones;
}

/** Corre dependency-cruiser sobre un fixture y devuelve los errores hallados. */
function chequearFixture(fixture: Fixture): string[] {
  const resultado = spawnSync(
    process.execPath,
    [BIN_DEPCRUISE, "src", "--config", RUTA_CONFIG, "--output-type", "err"],
    {
      cwd: path.join(DIR_FIXTURES, fixture.regla),
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
    return [
      "el fixture fue ACEPTADO: dependency-cruiser no lo está rechazando.",
    ];
  }

  const violaciones = extraerViolaciones(salida);
  const errores: string[] = [];

  for (const violacion of violaciones) {
    if (violacion.regla !== fixture.regla) {
      errores.push(
        `lo rechazó otra regla: '${violacion.regla}' (desde ${violacion.desde}). Cada fixture tiene que violar solo la suya.`,
      );
    }
  }

  const desdeLaRegla = new Set(
    violaciones
      .filter((violacion) => violacion.regla === fixture.regla)
      .map((violacion) => violacion.desde),
  );
  const faltantes = fixture.archivosQueViolan.filter(
    (archivo) => !desdeLaRegla.has(archivo),
  );
  const sobrantes = [...desdeLaRegla].filter(
    (archivo) => !fixture.archivosQueViolan.includes(archivo),
  );
  if (faltantes.length > 0) {
    errores.push(
      `estos archivos tenían que violar la regla y no aparecen: ${faltantes.join(", ")}.`,
    );
  }
  if (sobrantes.length > 0) {
    errores.push(
      `estos archivos violan la regla sin tener que hacerlo (es el caso permitido): ${sobrantes.join(", ")}.`,
    );
  }
  return errores;
}

function main(): void {
  let todoBien = true;

  const erroresCobertura = chequearCobertura();
  for (const error of erroresCobertura) {
    console.error(`ERROR: ${error}`);
    todoBien = false;
  }

  for (const fixture of FIXTURES) {
    if (!existsSync(path.join(DIR_FIXTURES, fixture.regla))) {
      continue; // ya reportado por chequearCobertura
    }
    console.log(`--- tests/fixtures/limites/${fixture.regla}/ ---`);
    const errores = chequearFixture(fixture);

    if (errores.length === 0) {
      console.log(
        `OK: '${fixture.regla}' fue rechazado por su regla, desde los archivos esperados (${fixture.archivosQueViolan.length}).\n`,
      );
    } else {
      for (const error of errores) {
        console.error(`ERROR (${fixture.regla}): ${error}`);
      }
      console.error("");
      todoBien = false;
    }
  }

  if (todoBien) {
    console.log(
      `limites:fixtures: los ${FIXTURES.length} fixtures fueron rechazados a propósito, cada uno por su regla. Todo bien.`,
    );
    process.exit(0);
  }

  console.error(
    "limites:fixtures: al menos un fixture no fue rechazado como se esperaba. " +
      "Revisá .dependency-cruiser.cjs y tests/fixtures/limites/.",
  );
  process.exit(1);
}

main();
