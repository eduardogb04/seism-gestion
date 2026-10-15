/**
 * Lo facturado de una orden de compra y lo que falta facturar (F2-06, ADR
 * 0036). Se compara **sin IVA**: el monto de la orden se carga sin IVA.
 *
 * El saldo puede ser negativo: se factura de más por ajustes y adicionales, y
 * eso avisa pero no impide. Por eso no usa `pagar` de `saldo.ts`, que rechaza.
 */

import {
  crearImporte,
  type Importe,
  type Moneda,
} from "../compartido/importe.ts";
import { restarEnMoneda, sumarEnMoneda } from "../compartido/saldo.ts";

export interface SaldoDeOrden<M extends Moneda, F> {
  readonly total: Importe<M>;
  /** Las facturas en la moneda de la orden. */
  readonly facturado: Importe<M>;
  /** El total menos lo facturado: negativo si se facturó de más. */
  readonly saldo: Importe<M>;
  /** Las facturas en otra moneda: no suman, no se convierte nada. */
  readonly otraMoneda: readonly F[];
}

/** El saldo de una orden por `total` y las facturas vigentes que le corresponden (con su importe sin IVA). */
export function saldoDeOrden<
  M extends Moneda,
  F extends { readonly importe: Importe<Moneda> },
>(total: Importe<M>, facturas: readonly F[]): SaldoDeOrden<M, F> {
  let facturado = crearImporte(0n, total.moneda);
  const otraMoneda: F[] = [];
  for (const factura of facturas) {
    if (factura.importe.moneda === total.moneda) {
      // La moneda se comprobó en ejecución: es la de `total`.
      facturado = sumarEnMoneda(facturado, factura.importe as Importe<M>);
    } else {
      otraMoneda.push(factura);
    }
  }
  return {
    total,
    facturado,
    saldo: restarEnMoneda(total, facturado),
    otraMoneda,
  };
}
