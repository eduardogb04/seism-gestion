/**
 * Un error del catálogo en pantalla (F0-32): el código, su descripción y qué
 * hacer, nada del caso concreto. Lo usan las páginas de administración para
 * `AUT-0003` (quien no es administrador) y para lo que rechaza una acción.
 */

import type { ErrorDeLogin } from "../../casos-uso/sesion/errores.ts";

export function ErrorEnPantalla({ error }: { readonly error: ErrorDeLogin }) {
  return (
    <section
      role="alert"
      className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-900"
    >
      <p>
        <strong data-codigo-error>{error.codigo}</strong> · {error.mensaje}
      </p>
      <p>{error.queHacer}</p>
    </section>
  );
}
