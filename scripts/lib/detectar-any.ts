/**
 * Recorrido sintáctico compartido: busca `SyntaxKind.AnyKeyword` en un
 * `SourceFile` ya parseado. Lo usan `sin-any.ts` (proyecto entero, según
 * `tsconfig.json`) y `typecheck-fixtures.ts` (un fixture a la vez).
 */

import ts from "typescript";

export interface UbicacionAny {
  readonly linea: number;
}

export function detectarAnyEnArchivo(archivoFuente: ts.SourceFile): UbicacionAny[] {
  const ubicaciones: UbicacionAny[] = [];

  function visitar(nodo: ts.Node): void {
    if (nodo.kind === ts.SyntaxKind.AnyKeyword) {
      const { line } = archivoFuente.getLineAndCharacterOfPosition(nodo.getStart());
      ubicaciones.push({ linea: line + 1 });
    }
    ts.forEachChild(nodo, visitar);
  }

  visitar(archivoFuente);
  return ubicaciones;
}
