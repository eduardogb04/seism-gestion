/**
 * Las dos formas de mostrar un `ErrorSistema` (F0-23, ADR 0020). El código es
 * el mismo en las dos: el que Pilar lee en pantalla es el que se busca en el
 * log.
 *
 * - `paraPantalla`: `{ codigo, tipo, mensaje }`, con la descripción del
 *   catálogo como mensaje. Nada del caso concreto: ni detalles, ni causa, ni
 *   pila.
 * - `paraLog`: `{ codigo, tipo, detalles, causa, pila }`. La causa se
 *   serializa recursivamente si es otro `ErrorSistema`.
 */

import type { Codigo, TipoError } from "./catalogo.ts";
import { type Detalles, ErrorSistema } from "./error-sistema.ts";

export interface ErrorParaPantalla {
  readonly codigo: Codigo;
  readonly tipo: TipoError;
  readonly mensaje: string;
}

/** Una causa que no es `ErrorSistema`: el nombre del error (o el tipo del valor) y su texto. */
export interface CausaAjena {
  readonly nombre: string;
  readonly mensaje: string;
}

export interface ErrorParaLog {
  readonly codigo: Codigo;
  readonly tipo: TipoError;
  readonly detalles: Detalles;
  readonly causa: ErrorParaLog | CausaAjena | null;
  readonly pila: string | null;
}

export function paraPantalla(error: ErrorSistema): ErrorParaPantalla {
  return {
    codigo: error.codigo,
    tipo: error.tipo,
    mensaje: error.entrada.descripcion,
  };
}

export function paraLog(error: ErrorSistema): ErrorParaLog {
  return {
    codigo: error.codigo,
    tipo: error.tipo,
    detalles: error.detalles,
    causa: serializarCausa(error.cause),
    pila: error.stack ?? null,
  };
}

function serializarCausa(causa: unknown): ErrorParaLog | CausaAjena | null {
  if (causa === undefined) {
    return null;
  }
  if (causa instanceof ErrorSistema) {
    return paraLog(causa);
  }
  if (causa instanceof Error) {
    return { nombre: causa.name, mensaje: causa.message };
  }
  return { nombre: typeof causa, mensaje: String(causa) };
}
