/**
 * Una ventana sobre la pantalla (F1-09): el fondo se atenúa y el listado sigue
 * detrás. La dibuja el servidor según la URL, así que no exige JavaScript; en
 * el celular ocupa el ancho disponible y, si el contenido es largo, hace scroll
 * dentro de ella.
 */

import type { ReactNode } from "react";
import { Enlace } from "./enlace-next.ts";

const ID_DEL_TITULO = "titulo-de-la-ventana";

export function Ventana({
  titulo,
  rutaAlCerrar,
  children,
}: {
  readonly titulo: string;
  readonly rutaAlCerrar: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={ID_DEL_TITULO}
        className="max-h-full w-full max-w-xl overflow-y-auto rounded bg-white p-4 shadow-lg sm:p-6"
      >
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id={ID_DEL_TITULO} className="text-xl font-semibold">
            {titulo}
          </h2>
          <Enlace href={rutaAlCerrar} scroll={false}>
            Cerrar
          </Enlace>
        </div>
        {children}
      </section>
    </div>
  );
}
