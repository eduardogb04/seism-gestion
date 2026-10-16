/** Las reglas de texto que repiten las definiciones de los ABM. */

import { z } from "zod";

/** Un `textoLargo` vacío llega como `null`: el mismo mensaje lo cubre. */
export function obligatorio(que: string, maximo: number) {
  return z
    .string(`Escribí ${que}.`)
    .trim()
    .min(1, `Escribí ${que}.`)
    .max(maximo, `No puede pasar de ${maximo} caracteres.`);
}

export function opcional(maximo: number) {
  return z
    .string()
    .trim()
    .max(maximo, `No puede pasar de ${maximo} caracteres.`)
    .nullable();
}
