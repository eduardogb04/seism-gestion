/**
 * Ningún marcador de conflicto de merge entra al repo (M-03). Un merge
 * resuelto a mano dejó `<<<<<<< HEAD` / `=======` / `>>>>>>> origin/main` en
 * `AGENTS.md` y llegó a `main`: ningún chequeo lo vio porque un `.md`, un
 * `.yml` o un `.json` no se compilan ni se testean.
 *
 * Recorre **todos los archivos versionados** (`git ls-files`, desde el
 * directorio actual: así `node_modules/`, `.next/` y lo que git ignora no
 * cuentan) y rechaza, con `archivo:línea regla`, la línea que:
 *
 * - `sin-marcas-conflicto/inicio`: empieza con `<<<<<<< `.
 * - `sin-marcas-conflicto/medio`: es exactamente `=======` (siete signos, lo
 *   que escribe git). `=======` dentro de una línea no cuenta, ni el
 *   subrayado de un título setext de Markdown de otra longitud.
 * - `sin-marcas-conflicto/fin`: empieza con `>>>>>>> `.
 *
 * Los binarios se saltean: los que tienen un byte nulo en los primeros 8000
 * bytes.
 *
 * Con argumentos (`node scripts/sin-marcas-conflicto.ts <archivo>...`) mira
 * solo esos archivos y no aplica la excepción: así `npm run lint:fixtures`
 * prueba que rechaza (`tests/fixtures/lint/conflicto/`). `npm run lint` lo
 * corre después de `sin-error-crudo`.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

/**
 * La única excepción: los fixtures que prueban este script tienen marcadores
 * a propósito (`rechazado.md`). Sin ella, el script se rechazaría a sí mismo.
 */
const CARPETA_EXCEPTUADA = "tests/fixtures/lint/conflicto/";

/** Cuántos bytes se miran buscando un byte nulo para decidir si es binario. */
const BYTES_PARA_DETECTAR_BINARIO = 8000;

interface Violacion {
  readonly ubicacion: string;
  readonly regla: string;
}

function esBinario(contenido: Buffer): boolean {
  return contenido.subarray(0, BYTES_PARA_DETECTAR_BINARIO).includes(0);
}

function reglaDe(linea: string): string | undefined {
  if (linea.startsWith("<<<<<<< ")) {
    return "sin-marcas-conflicto/inicio";
  }
  if (linea === "=======") {
    return "sin-marcas-conflicto/medio";
  }
  if (linea.startsWith(">>>>>>> ")) {
    return "sin-marcas-conflicto/fin";
  }
  return undefined;
}

function archivosVersionados(): string[] {
  const salida = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return salida
    .split("\0")
    .filter((ruta) => ruta !== "" && !ruta.startsWith(CARPETA_EXCEPTUADA));
}

function violacionesEn(ruta: string): Violacion[] {
  const contenido = readFileSync(ruta);
  if (esBinario(contenido)) {
    return [];
  }
  const violaciones: Violacion[] = [];
  // `\r?\n`: un `=======` en un archivo con finales de línea de Windows también es un marcador.
  contenido
    .toString("utf8")
    .split(/\r?\n/)
    .forEach((linea, indice) => {
      const regla = reglaDe(linea);
      if (regla !== undefined) {
        violaciones.push({ ubicacion: `${ruta}:${indice + 1}`, regla });
      }
    });
  return violaciones;
}

function main(): void {
  const argumentos = process.argv.slice(2);
  const archivos = argumentos.length > 0 ? argumentos : archivosVersionados();
  const violaciones: Violacion[] = [];

  for (const ruta of archivos) {
    // `git ls-files` lista lo versionado aunque esté borrado del árbol de trabajo.
    if (existsSync(ruta)) {
      violaciones.push(...violacionesEn(ruta));
    }
  }

  if (violaciones.length > 0) {
    console.error(
      "Marcadores de conflicto de merge sin resolver (ver AGENTS.md, Reglas no negociables):",
    );
    for (const { ubicacion, regla } of violaciones) {
      console.error(`${ubicacion} ${regla}`);
    }
    console.error(
      "Resolvé el conflicto: dejá el texto que corresponde y borrá las líneas <<<<<<<, ======= y >>>>>>>.",
    );
    process.exit(1);
  }

  console.log(
    `sin-marcas-conflicto: ninguna marca de conflicto en ${archivos.length} archivos.`,
  );
  process.exit(0);
}

main();
