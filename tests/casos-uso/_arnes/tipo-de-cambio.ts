/** El tipo de cambio que exige un documento en dólares (F3-04), para los tests que no lo prueban. Datos inventados. */

import type { Escrito } from "../../../src/casos-uso/abm/definicion.ts";

const CAMBIO_DE_EJEMPLO = {
  cambio: "1.100,00",
  cambioFuente: "Cotización de ejemplo",
} as const;

/** El mismo escrito, con un tipo de cambio de ejemplo si el importe es en dólares (lo que ya trae el escrito manda). */
export function conCambioSiEsEnDolares(escrito: Escrito): Escrito {
  return escrito.importeMoneda === "USD"
    ? { ...CAMBIO_DE_EJEMPLO, ...escrito }
    : escrito;
}
