/** Las reglas de texto que repiten las definiciones de los ABM. */

import { z } from "zod";

/** El tipo de cambio de un documento, ya leído por `leerCambio`: el valor es una fracción y la fuente, un texto (F3-04). */
export const cambioDeDocumento = z
  .object({
    valor: z.object({ numerador: z.bigint(), denominador: z.bigint() }),
    fuente: z.string(),
  })
  .nullable();

export function obligatorio(que: string, maximo: number) {
  return z
    .string()
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
