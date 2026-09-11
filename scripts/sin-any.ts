/**
 * TypeScript no tiene ninguna opción de compilador que prohíba el `any`
 * explícito (`strict` solo frena el implícito). Este script recorre, con la
 * API del compilador, todos los archivos que entran por `tsconfig.json`
 * (respeta su `include`/`exclude`: nada de `node_modules`, nada de
 * `tests/fixtures`) y falla con `archivo:línea` ante cualquier
 * `SyntaxKind.AnyKeyword`. Ver docs/adr/0002-any-explicito-en-typecheck.md.
 *
 * `npm run typecheck` lo corre después de `tsc --noEmit`.
 */

import path from "node:path";
import process from "node:process";
import ts from "typescript";
import { detectarAnyEnArchivo } from "./lib/detectar-any.ts";

function ubicacionesDeAny(rutaTsconfig: string): string[] {
  const cwd = process.cwd();
  const archivoConfig = ts.readConfigFile(rutaTsconfig, ts.sys.readFile);

  if (archivoConfig.error !== undefined) {
    throw new Error(`No se pudo leer ${rutaTsconfig}.`);
  }

  const config = ts.parseJsonConfigFileContent(
    archivoConfig.config,
    ts.sys,
    path.dirname(rutaTsconfig),
  );

  const ubicaciones: string[] = [];

  for (const nombreArchivo of config.fileNames) {
    const contenido = ts.sys.readFile(nombreArchivo);
    if (contenido === undefined) {
      continue;
    }
    const sourceFile = ts.createSourceFile(nombreArchivo, contenido, ts.ScriptTarget.Latest, true);
    for (const ubicacion of detectarAnyEnArchivo(sourceFile)) {
      ubicaciones.push(`${path.relative(cwd, nombreArchivo)}:${ubicacion.linea}`);
    }
  }

  return ubicaciones;
}

function main(): void {
  const cwd = process.cwd();
  const rutaTsconfig = ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");

  if (rutaTsconfig === undefined) {
    console.error("No se encontró tsconfig.json.");
    process.exit(1);
  }

  const ubicaciones = ubicacionesDeAny(rutaTsconfig);

  if (ubicaciones.length > 0) {
    console.error("Se encontró 'any' explícito (prohibido, ver AGENTS.md):");
    for (const ubicacion of ubicaciones) {
      console.error(`  ${ubicacion}`);
    }
    process.exit(1);
  }

  console.log("sin-any: sin 'any' explícito en el proyecto.");
  process.exit(0);
}

main();
