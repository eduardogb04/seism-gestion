import type { Escrito } from "../../../casos-uso/abm/definicion.ts";

/** Los campos de texto del formulario, tal cual se escribieron. Lo que agrega React (`$ACTION_...`) no es de la persona. */
export function escritoEn(formulario: FormData): Escrito {
  const escrito: Record<string, string> = {};
  for (const [nombre, valor] of formulario) {
    if (typeof valor === "string" && !nombre.startsWith("$ACTION_")) {
      escrito[nombre] = valor;
    }
  }
  return escrito;
}
