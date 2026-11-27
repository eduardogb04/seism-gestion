import type { ComponentProps } from "react";
import { BotonConEstado } from "./boton-con-estado.tsx";
import { cn } from "./cn.ts";

export type VarianteDeBoton =
  | "primario"
  | "secundario"
  | "peligro"
  | "fantasma"
  | "discreto";

const BASE =
  "presionable inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border px-3.5 text-sm font-medium no-underline select-none [&_svg]:size-4 [&_svg]:shrink-0 disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100 aria-disabled:pointer-events-none aria-disabled:opacity-55 pointer-coarse:h-11";

const VARIANTES: Record<VarianteDeBoton, string> = {
  primario:
    "border-transparent bg-acento text-sobre-acento shadow-tarjeta hover:bg-acento-fuerte",
  secundario:
    "border-borde-fuerte bg-superficie text-texto shadow-tarjeta hover:border-borde-control hover:bg-superficie-2",
  peligro:
    "border-transparent bg-peligro text-sobre-peligro shadow-tarjeta hover:bg-peligro-fuerte",
  fantasma:
    "border-transparent bg-transparent text-texto-2 hover:bg-superficie-2 hover:text-texto",
  // Las salidas negativas de un panel (F6-01): a la vista, pero sin competir con la acción principal.
  discreto:
    "h-8 border-transparent bg-transparent px-2.5 text-[13px] text-peligro hover:bg-peligro-suave",
};

/** Las clases del botón, para el enlace que tiene que verse como uno. */
export function clasesDeBoton(
  variante: VarianteDeBoton,
  extra?: string,
): string {
  return cn(BASE, VARIANTES[variante], extra);
}

/**
 * Un botón. `cargando`: lo deshabilita, lo marca `aria-busy` y le pone una
 * rueda chica delante del texto (que conviene cambiar: «Guardando…»).
 */
export function Boton({
  variante,
  cargando = false,
  disabled,
  children,
  ...resto
}: {
  readonly variante: VarianteDeBoton;
  readonly cargando?: boolean;
} & Omit<ComponentProps<"button">, "className">) {
  return (
    <BotonConEstado
      clases={clasesDeBoton(variante)}
      cargando={cargando}
      disabled={disabled}
      {...resto}
    >
      {children}
    </BotonConEstado>
  );
}
