/**
 * TypeScript no tiene ninguna opción de compilador que prohíba el `any`
 * explícito (`strict` solo frena el implícito). Este script recorre, con la
 * API del compilador, todos los archivos que entran por `tsconfig.json`
 * (respeta su `include`/`exclude`: nada de `node_modules`, nada de
 * `tests/fixtures`) y falla con `archivo:línea` ante cualquier
 * `SyntaxKind.AnyKeyword`. Ver docs/adr/0002-any-explicito-en-typecheck.md.
 *
 * Saltea lo que genera Next.js (`.next/types/`, `next-env.d.ts`): entra al
 * `tsconfig.json` para que `tsc` valide las exportaciones de páginas y rutas,
 * pero no es código nuestro y trae `any` propios (ADR 0005).
 *
 * Por el mismo motivo saltea el cliente que genera Prisma
 * (`src/adaptadores/prisma/generado/`, ADR 0008): lo escribe
 * `prisma generate`, no está en git y trae `any` propios. Nada más se saltea.
 *
 * `npm run typecheck` lo corre después de `tsc --noEmit`.
 */

import path from "node:path";
import process from "node:process";
import ts from "typescript";
import { detectarAnyEnArchivo } from "./lib/detectar-any.ts";

/**
 * Archivos que escriben las herramientas, no nosotros (ruta relativa a la
 * raíz): Next.js en `next dev`/`next build` y Prisma en `prisma generate`.
 */
function esGenerado(rutaRelativa: string): boolean {
  const ruta = rutaRelativa.split(path.sep).join("/");
  return (
    ruta.startsWith(".next/") ||
    ruta === "next-env.d.ts" ||
    ruta.startsWith("src/adaptadores/prisma/generado/")
  );
}

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

  const raiz = path.dirname(rutaTsconfig);
  const archivosPropios = config.fileNames.filter(
    (nombreArchivo) => !esGenerado(path.relative(raiz, nombreArchivo)),
  );

  for (const nombreArchivo of archivosPropios) {
    const contenido = ts.sys.readFile(nombreArchivo);
    if (contenido === undefined) {
      continue;
    }
    const sourceFile = ts.createSourceFile(
      nombreArchivo,
      contenido,
      ts.ScriptTarget.Latest,
      true,
    );
    for (const ubicacion of detectarAnyEnArchivo(sourceFile)) {
      ubicaciones.push(
        `${path.relative(cwd, nombreArchivo)}:${ubicacion.linea}`,
      );
    }
  }

  return ubicaciones;
}

function main(): void {
  const cwd = process.cwd();
  const rutaTsconfig = ts.findConfigFile(
    cwd,
    ts.sys.fileExists,
    "tsconfig.json",
  );

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
