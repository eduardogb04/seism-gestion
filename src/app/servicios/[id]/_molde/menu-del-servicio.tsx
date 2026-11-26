"use client";

/**
 * El menú «⋯» del encabezado del servicio: editar, las salidas negativas
 * (perdido, sin respuesta, cancelar) y dar de baja. Cada opción es un enlace
 * que abre su ventana de confirmación en el panel de la etapa actual.
 */

import { Ellipsis } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { cn } from "../../../_ui/cn.ts";
import { Enlace as Link } from "../../../_ui/enlace-next.ts";

export type OpcionDelMenu = {
  readonly texto: string;
  readonly href: string;
  readonly peligro?: boolean;
};

const ITEM =
  "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] text-texto-2 no-underline outline-none select-none data-[highlighted]:bg-superficie-2 data-[highlighted]:text-texto pointer-coarse:h-11";

export function MenuDelServicio({
  grupos,
}: {
  /** Las opciones, en grupos separados por una línea. */
  readonly grupos: readonly (readonly OpcionDelMenu[])[];
}) {
  const conOpciones = grupos.filter((grupo) => grupo.length > 0);
  if (conOpciones.length === 0) {
    return null;
  }
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Más acciones"
          title="Más acciones"
          className="presionable grid size-9 shrink-0 cursor-pointer place-items-center rounded-control border border-borde-fuerte bg-superficie text-texto-2 shadow-tarjeta hover:bg-superficie-2 hover:text-texto data-[state=open]:bg-superficie-2 pointer-coarse:size-11"
        >
          <Ellipsis aria-hidden="true" className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="menu-flotante z-50 min-w-52 rounded-[10px] border border-borde bg-superficie p-1.5 shadow-flota"
        >
          {conOpciones.map((grupo, lugar) => (
            <DropdownMenu.Group key={grupo[0]?.texto ?? lugar}>
              {lugar === 0 ? null : (
                <DropdownMenu.Separator className="my-1 h-px bg-borde" />
              )}
              {grupo.map(({ texto, href, peligro }) => (
                <DropdownMenu.Item key={texto} asChild className={ITEM}>
                  <Link
                    href={href}
                    scroll={false}
                    className={cn(
                      peligro &&
                        "text-peligro data-[highlighted]:bg-peligro-suave data-[highlighted]:text-peligro",
                    )}
                  >
                    {texto}
                  </Link>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Group>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
