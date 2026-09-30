/**
 * F0-33: dos chequeos sintácticos sobre `src/app/**` (sin type checker, como
 * `firmas-de-escritura.ts`) que sostienen *"las rutas obtienen el `Actor`
 * solo desde la sesión validada"*:
 *
 * - `construyeActorDePersona`: el archivo contiene el literal
 *   `tipo: "persona"`, o sea arma a mano un `Actor` de persona. Solo
 *   `src/app/(auth)/sesion-actual.ts` puede (y hoy ni siquiera lo hace: el
 *   actor lo arma `actorDeSesion`, en `src/casos-uso/sesion/acceso.ts`).
 * - `accionesSinActor`: cada Server Action (`export async function` de un
 *   archivo con la directiva `"use server"`, la que se exporta aparte con
 *   `export { f }` / `export { f as g }` / `export default f`, o una función
 *   con la directiva adentro) llama a `actorDesdeSesion()` o a `accesoDeAdministrador()`. Vale
 *   la llamada directa o a través de una función **del mismo archivo** que a
 *   su vez la haga (`ejecutar` en `acciones.ts`): el `Actor` sigue saliendo de
 *   la sesión, y la cadena se sigue hasta que no haya más funciones locales.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/** Lo único que puede dar un `Actor` en la app: la sesión validada. */
export const FUENTES_DE_ACTOR: readonly string[] = [
  "actorDesdeSesion",
  "accesoDeAdministrador",
];

const ACTOR_DE_PERSONA_A_MANO = /tipo\s*:\s*["'`]persona["'`]/;

export function construyeActorDePersona(codigo: string): boolean {
  return ACTOR_DE_PERSONA_A_MANO.test(codigo);
}

type FuncionLocal =
  | ts.FunctionDeclaration
  | ts.ArrowFunction
  | ts.FunctionExpression;

/** Una Server Action y, si se exporta con otro nombre, el nombre exportado. */
type Accion = {
  readonly funcion: FuncionLocal;
  readonly nombre: string | undefined;
};

function esAsincrona(nodo: ts.Node): boolean {
  return (
    ts.canHaveModifiers(nodo) &&
    (ts.getModifiers(nodo) ?? []).some(
      (modificador) => modificador.kind === ts.SyntaxKind.AsyncKeyword,
    )
  );
}

function esExportada(nodo: ts.Node): boolean {
  return (
    ts.canHaveModifiers(nodo) &&
    (ts.getModifiers(nodo) ?? []).some(
      (modificador) => modificador.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

function empiezaConUseServer(cuerpo: readonly ts.Statement[]): boolean {
  const primera = cuerpo[0];
  return (
    primera !== undefined &&
    ts.isExpressionStatement(primera) &&
    ts.isStringLiteral(primera.expression) &&
    primera.expression.text === "use server"
  );
}

function llamaA(nodo: ts.Node, nombres: ReadonlySet<string>): boolean {
  if (
    ts.isCallExpression(nodo) &&
    ts.isIdentifier(nodo.expression) &&
    nombres.has(nodo.expression.text)
  ) {
    return true;
  }
  return ts.forEachChild(nodo, (hijo) => llamaA(hijo, nombres)) ?? false;
}

/** Las funciones de nivel de archivo que tienen nombre: declaradas o `const f = ...`. */
function funcionesDeNivelDeArchivo(
  fuente: ts.SourceFile,
): Map<string, FuncionLocal> {
  const funciones = new Map<string, FuncionLocal>();
  for (const sentencia of fuente.statements) {
    if (ts.isFunctionDeclaration(sentencia) && sentencia.name !== undefined) {
      funciones.set(sentencia.name.text, sentencia);
    } else if (ts.isVariableStatement(sentencia)) {
      for (const declaracion of sentencia.declarationList.declarations) {
        const valor = declaracion.initializer;
        if (
          ts.isIdentifier(declaracion.name) &&
          valor !== undefined &&
          (ts.isArrowFunction(valor) || ts.isFunctionExpression(valor))
        ) {
          funciones.set(declaracion.name.text, valor);
        }
      }
    }
  }
  return funciones;
}

/** Los nombres que llegan a la sesión: las fuentes y toda función local que las llame, hasta que no crezca. */
function nombresQueLlegan(
  funciones: ReadonlyMap<string, FuncionLocal>,
): Set<string> {
  const nombres = new Set(FUENTES_DE_ACTOR);
  let creció = true;
  while (creció) {
    creció = false;
    for (const [nombre, funcion] of funciones) {
      if (!nombres.has(nombre) && llamaA(funcion, nombres)) {
        nombres.add(nombre);
        creció = true;
      }
    }
  }
  return nombres;
}

function nombreDeAccion(funcion: FuncionLocal, respaldo: string): string {
  if (ts.isFunctionDeclaration(funcion)) {
    return funcion.name?.text ?? "default";
  }
  const declaracion = funcion.parent;
  return ts.isVariableDeclaration(declaracion) &&
    ts.isIdentifier(declaracion.name)
    ? declaracion.name.text
    : respaldo;
}

/**
 * Las Server Actions de `codigo` que no llegan a `actorDesdeSesion()` ni a
 * `accesoDeAdministrador()`, por nombre. `[]` si el archivo no tiene
 * ninguna acción o todas la piden.
 */
export function accionesSinActor(archivo: string, codigo: string): string[] {
  const fuente = ts.createSourceFile(
    archivo,
    codigo,
    ts.ScriptTarget.ES2023,
    true,
    archivo.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const acciones: Accion[] = [];
  function sumar(funcion: FuncionLocal, nombre: string | undefined): void {
    if (!acciones.some((accion) => accion.funcion === funcion)) {
      acciones.push({ funcion, nombre });
    }
  }
  const locales = funcionesDeNivelDeArchivo(fuente);

  if (empiezaConUseServer(fuente.statements)) {
    for (const sentencia of fuente.statements) {
      if (
        ts.isFunctionDeclaration(sentencia) &&
        esExportada(sentencia) &&
        esAsincrona(sentencia)
      ) {
        sumar(sentencia, undefined);
      } else if (ts.isVariableStatement(sentencia) && esExportada(sentencia)) {
        for (const declaracion of sentencia.declarationList.declarations) {
          const valor = declaracion.initializer;
          if (
            valor !== undefined &&
            (ts.isArrowFunction(valor) || ts.isFunctionExpression(valor)) &&
            esAsincrona(valor)
          ) {
            sumar(valor, undefined);
          }
        }
      } else if (
        ts.isExportDeclaration(sentencia) &&
        sentencia.moduleSpecifier === undefined &&
        sentencia.exportClause !== undefined &&
        ts.isNamedExports(sentencia.exportClause)
      ) {
        // export { f } / export { f as g }: la función es la local, el nombre el exportado.
        for (const especificador of sentencia.exportClause.elements) {
          const funcion = locales.get(
            (especificador.propertyName ?? especificador.name).text,
          );
          if (funcion !== undefined && esAsincrona(funcion)) {
            sumar(funcion, especificador.name.text);
          }
        }
      } else if (
        ts.isExportAssignment(sentencia) &&
        !sentencia.isExportEquals
      ) {
        // export default f / export default async () => {}
        const valor = sentencia.expression;
        const funcion = ts.isIdentifier(valor)
          ? locales.get(valor.text)
          : ts.isArrowFunction(valor) || ts.isFunctionExpression(valor)
            ? valor
            : undefined;
        if (funcion !== undefined && esAsincrona(funcion)) {
          sumar(funcion, "default");
        }
      }
    }
  }

  // Acciones en línea: una función cuyo cuerpo empieza con la directiva.
  function buscarEnLinea(nodo: ts.Node): void {
    if (
      (ts.isFunctionDeclaration(nodo) ||
        ts.isArrowFunction(nodo) ||
        ts.isFunctionExpression(nodo)) &&
      nodo.body !== undefined &&
      ts.isBlock(nodo.body) &&
      empiezaConUseServer(nodo.body.statements) &&
      !acciones.some((accion) => accion.funcion === nodo)
    ) {
      acciones.push({ funcion: nodo, nombre: undefined });
    }
    ts.forEachChild(nodo, buscarEnLinea);
  }
  buscarEnLinea(fuente);

  const llegan = nombresQueLlegan(locales);
  return acciones
    .filter((accion) => !llamaA(accion.funcion, llegan))
    .map(
      (accion) => accion.nombre ?? nombreDeAccion(accion.funcion, "(anónima)"),
    );
}

/** Todos los `.ts` y `.tsx` bajo `carpeta`, recursivo. */
export function archivosDeLaApp(carpeta: string): string[] {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      return archivosDeLaApp(ruta);
    }
    return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
  });
}
