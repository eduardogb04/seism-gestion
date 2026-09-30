/**
 * F0-33: lista las **escrituras** que exporta un archivo de `src/casos-uso/**`
 * y dice si reciben un `Actor` en la primera posición. Sintáctico, como
 * `puertos-sin-borrado.ts`: `ts.createSourceFile`, sin `Program` ni type
 * checker, para que el nivel dominio siga tardando lo mismo.
 *
 * Una escritura es una función exportada, o un miembro (método o propiedad
 * con tipo función, a cualquier profundidad) de un `type`/`interface`
 * exportado, cuyo nombre empieza con un verbo de escritura: `crear`,
 * `guardar`, `dar`, `revocar`, `cambiar`, `marcar` o `registrar`. La lista de
 * verbos es la del plan (F0-33): no se suma ni se quita ninguno.
 *
 * "Recibe un `Actor` primero" es que la anotación de tipo del primer
 * parámetro sea, textualmente, `Actor`.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/** El nombre empieza con el verbo y sigue con mayúscula o termina ahí. */
export const PATRON_ESCRITURA =
  /^(crear|guardar|dar|revocar|cambiar|marcar|registrar)([A-Z]|$)/;

export type FirmaDeEscritura = {
  readonly archivo: string;
  readonly nombre: string;
  /** El texto de la anotación del primer parámetro; `null` si no tiene parámetros o no la anota. */
  readonly primerParametro: string | null;
};

export function recibeActorPrimero(firma: FirmaDeEscritura): boolean {
  return firma.primerParametro === "Actor";
}

function primerParametroDe(
  parametros: readonly ts.ParameterDeclaration[],
): string | null {
  return parametros[0]?.type?.getText() ?? null;
}

function esExportado(nodo: ts.Node): boolean {
  return (
    ts.canHaveModifiers(nodo) &&
    (ts.getModifiers(nodo) ?? []).some(
      (modificador) => modificador.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

function nombreDe(nombre: ts.PropertyName | undefined): string | null {
  return nombre !== undefined && ts.isIdentifier(nombre) ? nombre.text : null;
}

/** Las escrituras que `codigo` exporta (`archivo` es solo la etiqueta del informe). */
export function firmasDeEscritura(
  archivo: string,
  codigo: string,
): FirmaDeEscritura[] {
  const fuente = ts.createSourceFile(
    archivo,
    codigo,
    ts.ScriptTarget.ES2023,
    true,
  );
  const encontradas: FirmaDeEscritura[] = [];

  function sumar(
    nombre: string | null,
    parametros: readonly ts.ParameterDeclaration[],
  ): void {
    if (nombre !== null && PATRON_ESCRITURA.test(nombre)) {
      encontradas.push({
        archivo,
        nombre,
        primerParametro: primerParametroDe(parametros),
      });
    }
  }

  /** Los miembros de un tipo exportado, a cualquier profundidad. */
  function visitarMiembros(nodo: ts.Node): void {
    if (ts.isMethodSignature(nodo)) {
      sumar(nombreDe(nodo.name), nodo.parameters);
    } else if (
      ts.isPropertySignature(nodo) &&
      nodo.type !== undefined &&
      ts.isFunctionTypeNode(nodo.type)
    ) {
      sumar(nombreDe(nodo.name), nodo.type.parameters);
    }
    ts.forEachChild(nodo, visitarMiembros);
  }

  for (const sentencia of fuente.statements) {
    if (!esExportado(sentencia)) {
      continue;
    }
    if (ts.isFunctionDeclaration(sentencia)) {
      sumar(sentencia.name?.text ?? null, sentencia.parameters);
    } else if (ts.isVariableStatement(sentencia)) {
      for (const declaracion of sentencia.declarationList.declarations) {
        const valor = declaracion.initializer;
        if (
          ts.isIdentifier(declaracion.name) &&
          valor !== undefined &&
          (ts.isArrowFunction(valor) || ts.isFunctionExpression(valor))
        ) {
          sumar(declaracion.name.text, valor.parameters);
        }
      }
    } else if (
      ts.isInterfaceDeclaration(sentencia) ||
      ts.isTypeAliasDeclaration(sentencia)
    ) {
      visitarMiembros(sentencia);
    }
  }

  return encontradas;
}

function archivosTypeScript(carpeta: string): string[] {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      return archivosTypeScript(ruta);
    }
    return entrada.name.endsWith(".ts") ? [ruta] : [];
  });
}

/** Las escrituras de todos los `.ts` bajo `carpeta`, con `archivo` relativo a `raiz`. */
export function escriturasBajo(
  raiz: string,
  carpeta: string,
): FirmaDeEscritura[] {
  return archivosTypeScript(path.join(raiz, carpeta)).flatMap((ruta) =>
    firmasDeEscritura(
      path.relative(raiz, ruta).split(path.sep).join("/"),
      fs.readFileSync(ruta, "utf8"),
    ),
  );
}
