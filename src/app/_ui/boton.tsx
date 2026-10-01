import type { ComponentProps } from "react";

export type VarianteDeBoton = "primario" | "secundario" | "peligro";

const BASE =
  "inline-flex cursor-pointer items-center justify-center rounded border px-3 py-2 font-medium no-underline";

const VARIANTES: Record<VarianteDeBoton, string> = {
  primario: "border-acento bg-acento text-white hover:bg-acento-fuerte",
  secundario: "border-gray-300 bg-white text-gray-900 hover:bg-gray-100",
  peligro: "border-red-700 bg-red-700 text-white hover:bg-red-800",
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
