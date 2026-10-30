import type { ComponentProps } from "react";

export type VarianteDeBoton =
  | "primario"
  | "secundario"
  | "peligro"
  | "discreto";

const BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded border px-3 py-2 font-medium no-underline motion-safe:transition-colors motion-safe:duration-150 pointer-coarse:min-h-11";

const VARIANTES: Record<VarianteDeBoton, string> = {
  primario:
    "border-acento bg-acento text-sobre-acento hover:border-acento-fuerte hover:bg-acento-fuerte",
  secundario:
    "border-borde-control bg-superficie text-texto hover:bg-superficie-alta",
  peligro:
    "border-peligro bg-peligro text-sobre-peligro hover:border-peligro-fuerte hover:bg-peligro-fuerte",
  // Las salidas negativas de un panel (F6-01): a la vista, pero sin competir con la acción principal.
  discreto:
    "border-transparent bg-transparent text-sm text-peligro hover:bg-superficie-alta",
};

/** Las clases del botón, para el enlace que tiene que verse como uno. */
export function clasesDeBoton(variante: VarianteDeBoton): string {
  return `${BASE} ${VARIANTES[variante]}`;
}

export function Boton({
  variante,
  ...resto
}: { readonly variante: VarianteDeBoton } & Omit<
  ComponentProps<"button">,
  "className"
>) {
  return <button className={clasesDeBoton(variante)} {...resto} />;
}
