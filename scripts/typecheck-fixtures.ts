/**
 * Prueba negativa de `npm run typecheck`: los fixtures de
 * `tests/fixtures/typecheck/` TIENEN que ser rechazados (uno por un `any`
 * explícito, el otro por una variable sin usar). Este script corre el mismo
 * chequeo (tsc + sin-any) sobre cada fixture, **por separado**, con el
 * `tsconfig.json` propio de la carpeta de fixtures, imprime la salida de
 * error de la herramienta (así se ve que rechaza a propósito) e **invierte**
 * el código de salida: 0 si todos los fixtures fueron rechazados, 1 si
 * alguno fue aceptado.
 *
 * El `typecheck` normal (tsconfig.json de la raíz) excluye tests/fixtures/,
 * así que estos archivos nunca frenan una tarea real.
 */

import path from "node:path";
import process from "node:process";
import ts from "typescript";
import { detectarAnyEnArchivo } from "./lib/detectar-any.ts";

const DIR_FIXTURES = path.join(process.cwd(), "tests", "fixtures", "typecheck");
const RUTA_TSCONFIG_FIXTURES = path.join(DIR_FIXTURES, "tsconfig.json");
const ARCHIVOS_FIXTURE = ["any-explicito.ts", "variable-sin-usar.ts"];

interface ResultadoFixture {
  readonly rechazado: boolean;
  readonly salida: string[];
}

function leerCompilerOptions(rutaTsconfig: string): ts.CompilerOptions {
  const archivoConfig = ts.readConfigFile(rutaTsconfig, ts.sys.readFile);
  if (archivoConfig.error !== undefined) {
    throw new Error(`No se pudo leer ${rutaTsconfig}.`);
  }
  const config = ts.parseJsonConfigFileContent(
    archivoConfig.config,
    ts.sys,
    path.dirname(rutaTsconfig),
  );
  return config.options;
}

function formatearDiagnostico(diagnostico: ts.Diagnostic): string {
  const mensaje = ts.flattenDiagnosticMessageText(diagnostico.messageText, "\n");
  if (diagnostico.file !== undefined && diagnostico.start !== undefined) {
    const { line, character } = diagnostico.file.getLineAndCharacterOfPosition(diagnostico.start);
    const nombreArchivo = path.relative(process.cwd(), diagnostico.file.fileName);
    return `  ${nombreArchivo}:${line + 1}:${character + 1} - error TS${diagnostico.code}: ${mensaje}`;
  }
  return `  error TS${diagnostico.code}: ${mensaje}`;
}

function chequearFixture(rutaArchivo: string, opciones: ts.CompilerOptions): ResultadoFixture {
  const nombreArchivo = path.relative(process.cwd(), rutaArchivo);
  const salida: string[] = [];

  const programa = ts.createProgram([rutaArchivo], opciones);
  const sourceFile = programa.getSourceFile(rutaArchivo);

  if (sourceFile === undefined) {
    throw new Error(`No se pudo cargar ${rutaArchivo}.`);
  }

  const diagnosticos = [
    ...programa.getSyntacticDiagnostics(sourceFile),
    ...programa.getSemanticDiagnostics(sourceFile),
  ];

  for (const diagnostico of diagnosticos) {
    salida.push(formatearDiagnostico(diagnostico));
  }

  const ubicacionesAny = detectarAnyEnArchivo(sourceFile);
  for (const ubicacion of ubicacionesAny) {
    salida.push(`  ${nombreArchivo}:${ubicacion.linea} - 'any' explícito, prohibido (sin-any).`);
  }

  return { rechazado: diagnosticos.length > 0 || ubicacionesAny.length > 0, salida };
}

function main(): void {
  const opciones = leerCompilerOptions(RUTA_TSCONFIG_FIXTURES);
  let todosRechazados = true;

  for (const nombre of ARCHIVOS_FIXTURE) {
    const rutaArchivo = path.join(DIR_FIXTURES, nombre);
    console.log(`--- tests/fixtures/typecheck/${nombre} ---`);

    const resultado = chequearFixture(rutaArchivo, opciones);

    if (resultado.salida.length > 0) {
      console.log(resultado.salida.join("\n"));
    }

    if (resultado.rechazado) {
      console.log(`OK: '${nombre}' fue rechazado por la herramienta, como se esperaba.\n`);
    } else {
      console.error(`ERROR: '${nombre}' fue ACEPTADO. El typecheck no lo está rechazando.\n`);
      todosRechazados = false;
    }
  }

  if (todosRechazados) {
    console.log("typecheck:fixtures: los dos fixtures fueron rechazados a propósito. Todo bien.");
    process.exit(0);
  }

  console.error(
    "typecheck:fixtures: al menos un fixture fue aceptado cuando tenía que ser rechazado. " +
      "Revisá tsconfig.json y scripts/sin-any.ts.",
  );
  process.exit(1);
}

main();
