/**
 * El error que se lanza en los bordes (casos de uso, infraestructura,
 * adaptadores) — F0-23, ADR 0020. El dominio no lanza por reglas de negocio:
 * devuelve `Resultado` con el `codigo` de una entrada del catálogo.
 *
 * Es imposible armar uno sin código, y no es un acuerdo: el constructor es
 * `private` y lo único que construye es `nuevoError(entrada, detalles,
 * causa?)`, que exige una entrada del catálogo (su `codigo` tiene que tener la
 * forma `PREFIJO-NNNN`). `throw new Error(...)` y `new ErrorSistema(...)` en
 * `src/dominio` y `src/casos-uso` los rechaza `npm run lint`
 * (`scripts/sin-error-crudo.ts`).
 */

import type { Codigo, EntradaCatalogo, TipoError } from "./catalogo.ts";

/** Datos del caso concreto, para el log. Nunca van a pantalla. */
export type Detalles = Readonly<Record<string, unknown>>;

let construir: (
  entrada: EntradaCatalogo,
  detalles: Detalles,
  causa: unknown,
) => ErrorSistema;

export class ErrorSistema extends Error {
  readonly entrada: EntradaCatalogo;
  readonly codigo: Codigo;
  readonly tipo: TipoError;
  readonly detalles: Detalles;

  static {
    // El bloque estático es el único lugar, fuera de la clase, con acceso al
    // constructor privado: así `nuevoError` construye y nadie más.
    construir = (entrada, detalles, causa) =>
      new ErrorSistema(entrada, detalles, causa);
  }

  private constructor(
    entrada: EntradaCatalogo,
    detalles: Detalles,
    causa: unknown,
  ) {
    super(
      `${entrada.codigo} · ${entrada.descripcion}`,
      causa === undefined ? undefined : { cause: causa },
    );
    this.name = "ErrorSistema";
    this.entrada = entrada;
    this.codigo = entrada.codigo;
    this.tipo = entrada.tipo;
    this.detalles = Object.freeze({ ...detalles });
  }
}

/** La única forma de construir un `ErrorSistema`: desde una entrada del catálogo. */
export function nuevoError(
  entrada: EntradaCatalogo,
  detalles: Detalles,
  causa?: unknown,
): ErrorSistema {
  return construir(entrada, detalles, causa);
}
