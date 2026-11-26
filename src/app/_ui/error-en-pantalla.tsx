/**
 * Un error del catálogo en pantalla (F0-32): el código, su descripción y qué
 * hacer, nada del caso concreto. Lo usan las páginas de administración para
 * `AUT-0003` (quien no es administrador) y para lo que rechaza una acción.
 * Toma el foco si un formulario rechazado lo manda acá (`tabIndex={-1}`).
 */

import { CircleAlert } from "lucide-react";
import type { ErrorDeLogin } from "../../casos-uso/sesion/errores.ts";

export function ErrorEnPantalla({ error }: { readonly error: ErrorDeLogin }) {
  return (
    <section
      role="alert"
      tabIndex={-1}
      className="mb-4 flex gap-3 rounded-tarjeta border border-peligro/25 bg-peligro-suave p-4 text-texto focus-visible:outline-peligro"
    >
      <CircleAlert
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-peligro"
      />
      <div className="min-w-0">
        <p className="m-0 font-medium">
          <strong
            data-codigo-error
            className="mr-1 font-mono text-[13px] font-medium text-peligro"
          >
            {error.codigo}
          </strong>{" "}
          · {error.mensaje}
        </p>
        <p className="mt-1 mb-0 text-texto-2">{error.queHacer}</p>
      </div>
    </section>
  );
}
