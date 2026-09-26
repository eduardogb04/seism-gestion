/**
 * Formato de un importe para pantalla, en castellano: `USD 24.315,00` (F0-20).
 *
 * Es presentación, no regla de negocio: por eso vive en `src/app/` y no en el
 * dominio, del que solo lee tipos (`import type`, ADR 0004). Lo que produce
 * `formatearMonto` lo vuelve a leer `parsearImporte` del dominio (propiedad de
 * ida y vuelta en `tests/dominio/importe.test.ts`). Aritmética entera sobre
 * `bigint`, sin `Intl`: el resultado no depende de los datos de idioma con que
 * se compiló Node.
 */

import type { Importe, Moneda } from "../../dominio/compartido/importe.ts";

/** El monto sin moneda: `24.315,00`, `-0,05`. */
export function formatearMonto(importe: Importe<Moneda>): string {
  const negativo = importe.centavos < 0n;
  const positivo = negativo ? -importe.centavos : importe.centavos;
  const enteros = (positivo / 100n)
    .toString()
    .replace(/\B(?=([0-9]{3})+$)/g, ".");
  const decimales = (positivo % 100n).toString().padStart(2, "0");

  return `${negativo ? "-" : ""}${enteros},${decimales}`;
}

/** El monto con su código de moneda adelante: `USD 24.315,00`. */
export function formatearImporte(importe: Importe<Moneda>): string {
  return `${importe.moneda} ${formatearMonto(importe)}`;
}
