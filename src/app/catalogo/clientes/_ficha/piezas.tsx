/**
 * Piezas chicas compartidas por el listado y la ficha de Clientes.
 */

import type { ReactNode } from "react";
import { cn } from "../../../_ui/cn.ts";
import { Enlace } from "../../../_ui/enlace-next.ts";

/** Un enlace con ícono para las acciones de una fila (ventana sobre la pantalla). */
export function BotonDeIcono({
  href,
  texto,
  peligro = false,
  children,
}: {
  readonly href: string;
  readonly texto: string;
  readonly peligro?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Enlace
      href={href}
      scroll={false}
      aria-label={texto}
      title={texto}
      className={cn(
        "presionable grid size-8 place-items-center rounded-md text-texto-2 no-underline hover:bg-superficie-3",
        peligro ? "hover:text-peligro" : "hover:text-texto",
      )}
    >
      {children}
    </Enlace>
  );
}
