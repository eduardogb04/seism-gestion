/**
 * El avance de una orden de compra o de un servicio (F2-07, ADR 0037): por
 * moneda y **sin convertir**, el total (de las órdenes, sin IVA), lo facturado
 * (con IVA), lo cobrado (importes más retenciones) y lo pendiente de cobro. Son
 * dos bases distintas —sin y con IVA—: el pendiente es facturado menos cobrado,
 * no total menos cobrado.
 */

import {
  crearImporte,
  type Importe,
  MONEDAS,
  type Moneda,
} from "../compartido/importe.ts";
import { restarEnMoneda, sumarEnMoneda } from "../compartido/saldo.ts";

/** Una factura vigente: su total con IVA y lo que se le cobró (con retenciones). */
interface FacturaParaAvance {
  readonly total: Importe<Moneda>;
  readonly cobrado: Importe<Moneda>;
}

export interface AvanceEnMoneda {
  readonly moneda: Moneda;
  /** Las órdenes de compra, sin IVA. */
  readonly total: Importe<Moneda>;
  /** Las facturas, con IVA. */
  readonly facturado: Importe<Moneda>;
  readonly cobrado: Importe<Moneda>;
  /** Facturado menos cobrado. */
  readonly pendiente: Importe<Moneda>;
}

export function sumaEn(
  moneda: Moneda,
  importes: readonly Importe<Moneda>[],
): Importe<Moneda> {
  return importes
    .filter((importe) => importe.moneda === moneda)
    .reduce(sumarEnMoneda, crearImporte(0n, moneda));
}

/** El total de cada moneda que aparece, en el orden de `MONEDAS`: sin convertir. */
export function sumaPorMoneda(
  importes: readonly Importe<Moneda>[],
): readonly Importe<Moneda>[] {
  return MONEDAS.filter((moneda) =>
    importes.some((importe) => importe.moneda === moneda),
  ).map((moneda) => sumaEn(moneda, importes));
}

/** Una línea por cada moneda que aparece, en el orden de `MONEDAS`. */
export function avancePorMoneda(
  ordenes: readonly Importe<Moneda>[],
  facturas: readonly FacturaParaAvance[],
): readonly AvanceEnMoneda[] {
  const totales = facturas.map(({ total }) => total);
  return MONEDAS.filter((moneda) =>
    [...ordenes, ...totales].some((importe) => importe.moneda === moneda),
  ).map((moneda) => {
    const facturado = sumaEn(moneda, totales);
    const cobrado = sumaEn(
      moneda,
      facturas.map(({ cobrado: importe }) => importe),
    );
    return {
      moneda,
      total: sumaEn(moneda, ordenes),
      facturado,
      cobrado,
      pendiente: restarEnMoneda(facturado, cobrado),
    };
  });
}
