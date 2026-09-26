/**
 * Todo error tiene código estable del catálogo (F0-23, ADR 0020). Biome no
 * tiene una regla que prohíba `throw new Error(...)` (`useThrowOnlyError`
 * solo prohíbe lanzar lo que no es un `Error`), así que este script lo hace
 * con la API del compilador de TypeScript, como `scripts/sin-any.ts`.
 *
 * Recorre `src/dominio/` y `src/casos-uso/` (desde el directorio actual) y
 * rechaza, con `archivo:línea:columna regla`:
 *
 * - `sin-error-crudo/throwErrorCrudo`: `throw new Error(...)` o
 *   `throw Error(...)`, y lo mismo con los otros errores nativos
 *   (`TypeError`, `RangeError`...): un error sin código.
 * - `sin-error-crudo/newErrorSistema`: `new ErrorSistema(...)`. Se construye
 *   con `nuevoError(entrada, detalles)`; el constructor es privado y esto es
 *   la segunda red. La única excepción es el archivo que define la clase.
 *
 * Fuera de esas dos carpetas (adaptadores, infraestructura, app, scripts) no
 * aplica: los bordes traducen errores de afuera. `npm run lint` lo corre
 * después de Biome; `npm run lint:fixtures` prueba que rechaza
 * (`tests/fixtures/lint/error-crudo/`).
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const CARPETAS = ["src/dominio", "src/casos-uso"] as const;

/** El único archivo que puede decir `new ErrorSistema(`: el que define la clase. */
const DEFINICION_ERROR_SISTEMA =
  "src/dominio/compartido/errores/error-sistema.ts";

const ERRORES_NATIVOS: ReadonlySet<string> = new Set([
  "Error",
  "AggregateError",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);

interface Violacion {
  readonly ubicacion: string;
  readonly regla: string;
}

function archivosTs(carpeta: string): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(carpeta, { recursive: true, encoding: "utf8" });
  } catch {
    return [];
  }
  return entradas
    .map((relativa) => path.join(carpeta, relativa))
    .filter((ruta) => /\.tsx?$/.test(ruta) && !ruta.endsWith(".d.ts"));
}

/** `Error(...)` o `new Error(...)` (y los demás nativos) como expresión de un `throw`. */
function esErrorNativo(expresion: ts.Expression): boolean {
  const llamado =
    ts.isNewExpression(expresion) || ts.isCallExpression(expresion)
      ? expresion.expression
      : undefined;
  return (
    llamado !== undefined &&
    ts.isIdentifier(llamado) &&
    ERRORES_NATIVOS.has(llamado.text)
  );
}

function violacionesEn(rutaRelativa: string, contenido: string): Violacion[] {
  const archivo = ts.createSourceFile(
    rutaRelativa,
    contenido,
    ts.ScriptTarget.Latest,
    true,
  );
  const esDefinicion = rutaRelativa === DEFINICION_ERROR_SISTEMA;
  const violaciones: Violacion[] = [];

  const agregar = (nodo: ts.Node, regla: string): void => {
    const { line, character } = archivo.getLineAndCharacterOfPosition(
      nodo.getStart(archivo),
    );
    violaciones.push({
      ubicacion: `${rutaRelativa}:${line + 1}:${character + 1}`,
      regla,
    });
  };

  const visitar = (nodo: ts.Node): void => {
    if (ts.isThrowStatement(nodo) && esErrorNativo(nodo.expression)) {
      agregar(nodo, "sin-error-crudo/throwErrorCrudo");
    }
    if (
      !esDefinicion &&
      ts.isNewExpression(nodo) &&
      ts.isIdentifier(nodo.expression) &&
      nodo.expression.text === "ErrorSistema"
    ) {
      agregar(nodo, "sin-error-crudo/newErrorSistema");
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(archivo);

  return violaciones;
}

function main(): void {
  const raiz = process.cwd();
  const violaciones: Violacion[] = [];

  for (const carpeta of CARPETAS) {
    for (const ruta of archivosTs(path.join(raiz, carpeta))) {
      const relativa = path.relative(raiz, ruta).split(path.sep).join("/");
      violaciones.push(...violacionesEn(relativa, readFileSync(ruta, "utf8")));
    }
  }

  if (violaciones.length > 0) {
    console.error(
      "Error sin código del catálogo (prohibido en src/dominio y src/casos-uso, ver AGENTS.md):",
    );
    for (const { ubicacion, regla } of violaciones) {
      console.error(`${ubicacion} ${regla}`);
    }
    console.error(
      "Usá nuevoError(catalogo.<CODIGO>, detalles) en un borde, o devolvé un Resultado en el dominio.",
    );
    process.exit(1);
  }

  console.log(
    "sin-error-crudo: ni throw new Error ni new ErrorSistema en src/dominio y src/casos-uso.",
  );
  process.exit(0);
}

main();
