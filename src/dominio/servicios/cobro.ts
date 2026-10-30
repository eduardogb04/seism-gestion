/**
 * El saldo de una factura (F2-07, ADR 0037): su total con IVA, lo que se
 * cobró, lo que se retuvo y lo que falta. Una retención cancela deuda igual que
 * un cobro, así que cada cobro aporta al saldo su importe **más** su retención;
 * la regla es la de `saldo.ts` (la misma de los pagos), no una segunda.
 *
 * *Cobrada* no se guarda: es que el saldo llegó a cero.
 */

import type { Resultado } from "../compartido/historial.ts";
import {
  crearImporte,
  type Importe,
  type Moneda,
} from "../compartido/importe.ts";
import {
  type PagoRechazado,
  restarEnMoneda,
  saldoDe,
  sumarEnMoneda,
} from "../compartido/saldo.ts";

/** Lo que se cobró y lo que se retuvo, en la moneda de la factura. La retención llega ya validada (no negativa). */
export interface CobroDeFactura<M extends Moneda> {
  readonly importe: Importe<M>;
  readonly retencion: Importe<M> | null;
}

export interface SaldoDeFactura<M extends Moneda> {
  readonly total: Importe<M>;
  /** Las notas de crédito vigentes asociadas, con IVA (F6-03). */
  readonly acreditado: Importe<M>;
  readonly cobrado: Importe<M>;
  readonly retenido: Importe<M>;
  readonly saldo: Importe<M>;
}

function sumaDe<M extends Moneda>(
  moneda: M,
  importes: readonly (Importe<M> | null)[],
): Importe<M> {
  return importes.reduce<Importe<M>>(
    (suma, importe) => (importe === null ? suma : sumarEnMoneda(suma, importe)),
    crearImporte(0n, moneda),
  );
}

/**
 * El saldo de `total` después de las notas de crédito asociadas (`creditos`,
 * con IVA, F6-03) y de los cobros. Una nota o un cobro que no entra (según
 * `pagar` de `saldo.ts`: cero, de más o de otra moneda) rechaza el conjunto
 * entero; como todos bajan el saldo, si entran el orden no cambia nada.
 */
export function saldoDeFactura<M extends Moneda>(
  total: Importe<M>,
  cobros: readonly CobroDeFactura<M>[],
  creditos: readonly Importe<M>[] = [],
): Resultado<SaldoDeFactura<M>, PagoRechazado> {
  const cancelado = saldoDe(total, [
    ...creditos,
    ...cobros.map(({ importe, retencion }) =>
      retencion === null ? importe : sumarEnMoneda(importe, retencion),
    ),
  ]);
  if (!cancelado.ok) {
    return cancelado;
  }
  return {
    ok: true,
    valor: Object.freeze({
      total,
      acreditado: sumaDe(total.moneda, creditos),
      cobrado: sumaDe(
        total.moneda,
        cobros.map(({ importe }) => importe),
      ),
      retenido: sumaDe(
        total.moneda,
        cobros.map(({ retencion }) => retencion),
      ),
      saldo: cancelado.valor.saldo,
    }),
  };
}

export function estaCobrada(saldo: SaldoDeFactura<Moneda>): boolean {
  return saldo.saldo.centavos === 0n;
}

/** Lo que el comprobante suma a lo facturado: su total menos las notas de crédito asociadas (F6-03). */
export function facturadoNeto<M extends Moneda>(
  saldo: SaldoDeFactura<M>,
): Importe<M> {
  return restarEnMoneda(saldo.total, saldo.acreditado);
}

/**
 * Hay al menos un comprobante con saldo (factura, adicional o nota de débito) y
 * todos llegaron a cero, con las notas de crédito ya restadas: un servicio
 * finalizado se cierra (F3-01, F6-03).
 */
export function todoCobrado(
  saldos: readonly SaldoDeFactura<Moneda>[],
): boolean {
  return saldos.length > 0 && saldos.every(estaCobrada);
}
