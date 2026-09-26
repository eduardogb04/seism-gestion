/**
 * F0-22, R4: recorre una carpeta con la API del compilador de TypeScript
 * (sintáctico, sin resolver tipos: no hace falta un `Program`) y lista los
 * métodos y propiedades-función de cada interfaz/tipo **exportado** cuyo
 * nombre empieza con `eliminar`, `borrar`, `delete`, `remove`, `destroy` o
 * `purgar` — un borrado físico. Lo usa `tests/dominio/puertos-sin-borrado.test.ts`
 * sobre `src/puertos/**` (de verdad) y sobre
 * `tests/fixtures/puertos-con-borrado/` (para ver que lo detecta).
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const PATRON_BORRADO_FISICO =
  /^(eliminar|borrar|delete|remove|destroy|purgar)/i;

export interface MetodoDeBorradoFisico {
  readonly archivo: string;
  readonly nombre: string;
}

function archivosTypeScript(carpeta: string): string[] {
  if (!fs.existsSync(carpeta)) {
    return [];
  }
  const encontrados: string[] = [];
  for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      encontrados.push(...archivosTypeScript(ruta));
    } else if (entrada.isFile() && entrada.name.endsWith(".ts")) {
      encontrados.push(ruta);
    }
  }
  return encontrados;
}

function esExportado(
  nodo: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
): boolean {
  return (
    ts.canHaveModifiers(nodo) &&
    (ts.getModifiers(nodo) ?? []).some(
      (modificador) => modificador.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

function miembrosDe(
  nodo: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
): readonly ts.TypeElement[] {
  if (ts.isInterfaceDeclaration(nodo)) {
    return nodo.members;
  }
  return ts.isTypeLiteralNode(nodo.type) ? nodo.type.members : [];
}

function nombreDeMiembro(miembro: ts.TypeElement): string | null {
  if (
    (ts.isPropertySignature(miembro) || ts.isMethodSignature(miembro)) &&
    miembro.name !== undefined &&
    ts.isIdentifier(miembro.name)
  ) {
    return miembro.name.text;
  }
  return null;
}

/**
 * Lista, para cada archivo `.ts` bajo `carpeta` (recursivo), los métodos de
 * borrado físico de sus interfaces/tipos exportados.
 */
export function metodosDeBorradoFisico(
  carpeta: string,
): MetodoDeBorradoFisico[] {
  const encontrados: MetodoDeBorradoFisico[] = [];

  for (const archivo of archivosTypeScript(carpeta)) {
    const contenido = fs.readFileSync(archivo, "utf8");
    const archivoFuente = ts.createSourceFile(
      archivo,
      contenido,
      ts.ScriptTarget.ES2023,
      true,
    );

    function visitar(nodo: ts.Node): void {
      if (
        (ts.isInterfaceDeclaration(nodo) || ts.isTypeAliasDeclaration(nodo)) &&
        esExportado(nodo)
      ) {
        for (const miembro of miembrosDe(nodo)) {
          const nombre = nombreDeMiembro(miembro);
          if (nombre !== null && PATRON_BORRADO_FISICO.test(nombre)) {
            encontrados.push({ archivo, nombre });
          }
        }
      }
      ts.forEachChild(nodo, visitar);
    }

    visitar(archivoFuente);
  }

  return encontrados;
}
