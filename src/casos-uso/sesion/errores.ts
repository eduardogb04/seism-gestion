/**
 * Cómo se muestra en pantalla un error del login (F0-31): el código del
 * catálogo, su descripción y qué hacer. Nada del caso concreto (ADR 0020).
 * La app no puede leer el catálogo directo (solo tipos del dominio, ADR 0004):
 * lo lee por acá.
 */

import {
  type Codigo,
  catalogo,
  type EntradaCatalogo,
} from "../../dominio/compartido/errores/catalogo.ts";
import { ErrorSistema } from "../../dominio/compartido/errores/error-sistema.ts";

export type ErrorDeLogin = {
  readonly codigo: Codigo;
  readonly mensaje: string;
  readonly queHacer: string;
};

const ENTRADAS: readonly EntradaCatalogo[] = Object.values(catalogo);

function pantalla(entrada: EntradaCatalogo): ErrorDeLogin {
  return {
    codigo: entrada.codigo,
    mensaje: entrada.descripcion,
    queHacer: entrada.queHacer,
  };
}

/** El error para mostrar a partir de su código; uno desconocido es `INF-0001`. */
export function pantallaDeCodigo(codigo: string | undefined): ErrorDeLogin {
  const entrada = ENTRADAS.find((candidata) => candidata.codigo === codigo);
  return pantalla(entrada ?? catalogo.INF_0001);
}

/**
 * El código con que la app manda a la pantalla de error, si `error` es un
 * `ErrorSistema`; `null` si es cualquier otra cosa (un error inesperado, que
 * la app deja seguir para que quede en el log del servidor).
 */
export function codigoDeError(error: unknown): Codigo | null {
  return error instanceof ErrorSistema ? error.codigo : null;
}
