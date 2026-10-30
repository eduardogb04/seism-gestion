/**
 * Un comprobante con saldo (factura, factura adicional o nota de débito) con
 * sus cobros vigentes y su saldo (F2-07, ADR 0037), con las notas de crédito
 * vigentes asociadas ya restadas (F6-03, ADR 0050): lo que leen la cobranza, el
 * avance, *Por cobrar* y el cierre automático del servicio (F3-01), con la
 * regla de saldo del dominio. Las notas de crédito no tienen saldo propio: no
 * vuelven como fila.
 */

import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type { Moneda } from "../../dominio/compartido/importe.ts";
import type {
  CobroDeFactura,
  SaldoDeFactura,
} from "../../dominio/servicios/cobro.ts";
import {
  type Comprobante,
  saldosDeComprobantes,
} from "../../dominio/servicios/comprobante.ts";
import { totalConIva } from "../../dominio/servicios/factura.ts";
import type { Cobro } from "../../puertos/repositorios/cobros.ts";
import type { Factura } from "../../puertos/repositorios/facturas.ts";
import type { RepositoriosEnTransaccion } from "../../puertos/repositorios/transaccion.ts";

export type FacturaConCobros = {
  readonly factura: Factura;
  readonly cobros: readonly Cobro[];
  readonly saldo: SaldoDeFactura<Moneda>;
};

export const totalDe = (factura: Factura) =>
  totalConIva(factura.valor.importe, factura.valor.alicuota);

/** Lo que el dominio mira de una factura guardada. */
export const comprobanteDe = ({ valor }: Factura): Comprobante => ({
  id: valor.id,
  tipo: valor.tipo,
  adicional: valor.adicional,
  asociadoId: valor.comprobanteAsociadoId,
});

export const cobroDeFactura = ({ valor }: Cobro): CobroDeFactura<Moneda> => ({
  importe: valor.importe,
  retencion: valor.retencion,
});

/**
 * Los comprobantes con saldo de `facturas` (todos los vigentes de los servicios
 * que se miran, notas de crédito incluidas), en su orden, cada uno con sus
 * cobros (de entre `todos`) y su saldo.
 */
export function conSusCobros(
  facturas: readonly Factura[],
  todos: readonly Cobro[],
): readonly FacturaConCobros[] {
  const cobrosDe = (id: string) =>
    todos.filter(({ valor }) => valor.facturaId === id);
  const saldos = saldosDeComprobantes(
    facturas.map((factura) => ({
      ...comprobanteDe(factura),
      total: totalDe(factura),
      factura,
    })),
    (id) => cobrosDe(id).map(cobroDeFactura),
  );
  if (!saldos.ok) {
    throw nuevoError(catalogo.INF_0001, {
      motivo:
        "los cobros y las notas de crédito guardados de un comprobante no cierran con su total",
      facturaId: saldos.error.id,
    });
  }
  return saldos.valor.map(({ comprobante: { factura }, saldo }) => ({
    factura,
    cobros: cobrosDe(factura.valor.id),
    saldo,
  }));
}

export async function conCobrosDe(
  repos: RepositoriosEnTransaccion,
  facturas: readonly Factura[],
): Promise<readonly FacturaConCobros[]> {
  return conSusCobros(
    facturas,
    await repos.cobros.listarDe(facturas.map(({ valor }) => valor.id)),
  );
}
