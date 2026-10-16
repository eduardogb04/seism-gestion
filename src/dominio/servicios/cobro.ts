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
 * El saldo de `total` después de los cobros, en el orden dado. Un cobro que no
 * entra (según `pagar` de `saldo.ts`: cero, de más o de otra moneda) rechaza el
 * conjunto entero.
 */
export function saldoDeFactura<M extends Moneda>(
  total: Importe<M>,
  cobros: readonly CobroDeFactura<M>[],
): Resultado<SaldoDeFactura<M>, PagoRechazado> {
  const cancelado = saldoDe(
    total,
    cobros.map(({ importe, retencion }) =>
      retencion === null ? importe : sumarEnMoneda(importe, retencion),
    ),
  );
  if (!cancelado.ok) {
    return cancelado;
  }
  return {
    ok: true,
    valor: Object.freeze({
      total,
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
