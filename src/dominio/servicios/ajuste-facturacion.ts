/**
 * Los ajustes de facturación propuestos (R5, SYSTEM_SPEC §5.4): un recargo o un
 * descuento sobre lo facturado que un administrador aprueba o rechaza. Todo
 * sin IVA y en la moneda de la orden de compra vigente.
 *
 * - Un descuento aprobado baja lo que queda por facturar: saldo = total de la
 *   orden con ampliaciones − descuentos aprobados − facturado (`saldoConDescuentos`).
 * - Un recargo aprobado queda «por facturar» hasta que sale su factura adicional.
 * - Un servicio finalizado solo se cierra si no queda nada por facturar
 *   (`quedaPorFacturar`): saldo ≤ 0 y ningún recargo aprobado sin facturar.
 */

import {
  crearImporte,
  type Importe,
  type Moneda,
} from "../compartido/importe.ts";
import { restarEnMoneda, sumarEnMoneda } from "../compartido/saldo.ts";

export const CLASES_DE_AJUSTE = ["recargo", "descuento"] as const;
export type ClaseDeAjuste = (typeof CLASES_DE_AJUSTE)[number];

export const ESTADOS_DE_AJUSTE = [
  "pendiente",
  "aprobado",
  "rechazado",
] as const;
export type EstadoDeAjuste = (typeof ESTADOS_DE_AJUSTE)[number];

/** Un ajuste, con lo que las cuentas necesitan. */
export type AjusteParaCuentas = {
  readonly clase: ClaseDeAjuste;
  readonly estado: EstadoDeAjuste;
  readonly importe: Importe<Moneda>;
  /** Tiene ya su factura adicional o su nota de crédito. */
  readonly facturado: boolean;
};

/** El importe de un ajuste: cantidad entera (al principio del texto) por precio unitario, o el importe directo. `null` si no alcanza con lo cargado. */
export function importeDeAjuste(
  cantidad: string | null,
  precioUnitario: Importe<Moneda> | null,
  importe: Importe<Moneda> | null,
): Importe<Moneda> | null {
  if (precioUnitario === null) {
    return importe;
  }
  const entero = /^\s*(\d+)/.exec(cantidad ?? "")?.[1];
  if (entero === undefined) {
    return null;
  }
  return crearImporte(
    precioUnitario.centavos * BigInt(entero),
    precioUnitario.moneda,
  );
}

/** Lo que queda por facturar de la orden: total − descuentos aprobados − facturado. Negativo si ya se facturó de más. */
export function saldoConDescuentos<M extends Moneda>(
  total: Importe<M>,
  descuentosAprobados: readonly Importe<Moneda>[],
  facturado: Importe<M>,
): Importe<M> {
  let neto = total;
  for (const descuento of descuentosAprobados) {
    if (descuento.moneda === total.moneda) {
      neto = restarEnMoneda(neto, descuento as Importe<M>);
    }
  }
  return restarEnMoneda(neto, facturado);
}

/** Los descuentos aprobados de una lista de ajustes, en `moneda`. */
export function descuentosAprobados(
  ajustes: readonly AjusteParaCuentas[],
  moneda: Moneda,
): readonly Importe<Moneda>[] {
  return ajustes
    .filter(
      (ajuste) =>
        ajuste.clase === "descuento" &&
        ajuste.estado === "aprobado" &&
        ajuste.importe.moneda === moneda,
    )
    .map(({ importe }) => importe);
}

/** Cuánto hay que acreditar con una nota de crédito: el exceso (en positivo) si el saldo quedó negativo; cero si no. */
export function excesoDeDescuento<M extends Moneda>(
  saldo: Importe<M>,
): Importe<M> {
  return crearImporte(saldo.centavos < 0n ? -saldo.centavos : 0n, saldo.moneda);
}

/** El total de los recargos aprobados que todavía no se facturaron, en `moneda`. */
export function recargosSinFacturar(
  ajustes: readonly AjusteParaCuentas[],
  moneda: Moneda,
): Importe<Moneda> {
  let suma = crearImporte(0n, moneda);
  for (const ajuste of ajustes) {
    if (
      ajuste.clase === "recargo" &&
      ajuste.estado === "aprobado" &&
      !ajuste.facturado &&
      ajuste.importe.moneda === moneda
    ) {
      suma = sumarEnMoneda(suma, ajuste.importe);
    }
  }
  return suma;
}

/**
 * Si todavía queda algo por facturar: saldo de la orden con descuentos mayor
 * que cero, o algún recargo aprobado sin facturar. Sin orden (`saldo` nulo)
 * solo cuentan los recargos.
 */
export function quedaPorFacturar(
  saldo: Importe<Moneda> | null,
  ajustes: readonly AjusteParaCuentas[],
): boolean {
  const hayRecargo = ajustes.some(
    (ajuste) =>
      ajuste.clase === "recargo" &&
      ajuste.estado === "aprobado" &&
      !ajuste.facturado,
  );
  return hayRecargo || (saldo !== null && saldo.centavos > 0n);
}
