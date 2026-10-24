/**
 * El aviso que se lee antes de confirmar un ajuste de la cuota mensual (F3-03,
 * ADR 0041). Lo importa la pantalla en el navegador, así que no puede traer
 * nada de servidor.
 */

import { esDiaValido } from "../../dominio/compartido/reloj.ts";
import { nombreDelMes } from "../compartido/meses.ts";

/** Para un ajuste que rige desde el mes de `desde` (`aaaa-mm-dd`), o `null` si todavía no es un día. */
export function avisoDeAjuste(desde: string | undefined): string | null {
  if (desde === undefined || !esDiaValido(desde)) {
    return null;
  }
  const mes = nombreDelMes({
    anio: Number(desde.slice(0, 4)),
    mes: Number(desde.slice(5, 7)),
  });
  return `El cambio vale desde ${mes} en adelante; no cambia lo ya devengado.`;
}
