import type { Escrito } from "../../../casos-uso/abm/definicion.ts";
import type { ArchivoSubido } from "../../../casos-uso/documentos/documentos.ts";

/** Los campos de texto del formulario, tal cual se escribieron. Lo que agrega React (`$ACTION_...`) no es de la persona. */
export function escritoEn(formulario: FormData): Escrito {
  const escrito: Record<string, string> = {};
  for (const [nombre, valor] of formulario) {
    if (typeof valor === "string" && !nombre.startsWith("$ACTION_")) {
      escrito[nombre] = valor;
    }
  }
  return escrito;
}

/** El nombre del campo de archivo de un formulario: el de `FormularioAbm` y el que lee `archivoSubidoEn`. */
export const CAMPO_ARCHIVO = "archivo";

/** El archivo elegido en el formulario, o `null` si no se eligió ninguno. */
export async function archivoSubidoEn(
  formulario: FormData,
): Promise<ArchivoSubido | null> {
  const subido = formulario.get(CAMPO_ARCHIVO);
  // Sin archivo elegido el navegador manda una parte vacía, sin nombre; al
  // decodificarla, Next le pone «blob». Uno vacío que se eligió trae su nombre.
  return subido instanceof File &&
    !(subido.size === 0 && (subido.name === "" || subido.name === "blob"))
    ? {
        nombre: subido.name,
        bytes: new Uint8Array(await subido.arrayBuffer()),
      }
    : null;
}
