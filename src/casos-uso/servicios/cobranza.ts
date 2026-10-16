/**
 * Una factura con sus cobros vigentes y su saldo (F2-07, ADR 0037): lo que leen
 * la cobranza, el avance, *Por cobrar* y el cierre automático del servicio
 * (F3-01), con la regla de saldo del dominio.
 */

import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type { Moneda } from "../../dominio/compartido/importe.ts";
import {
  type CobroDeFactura,
  type SaldoDeFactura,
  saldoDeFactura,
} from "../../dominio/servicios/cobro.ts";
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

export const cobroDeFactura = ({ valor }: Cobro): CobroDeFactura<Moneda> => ({
  importe: valor.importe,
  retencion: valor.retencion,
});

/** La factura con sus cobros (de entre `todos`, los vigentes de varias facturas) y su saldo. */
export function conSusCobros(
  factura: Factura,
  todos: readonly Cobro[],
): FacturaConCobros {
  const cobros = todos.filter(
    ({ valor }) => valor.facturaId === factura.valor.id,
  );
  const saldo = saldoDeFactura(totalDe(factura), cobros.map(cobroDeFactura));
  if (!saldo.ok) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "los cobros guardados de una factura no cierran con su total",
      facturaId: factura.valor.id,
    });
  }
  return { factura, cobros, saldo: saldo.valor };
}

export async function conCobrosDe(
  repos: RepositoriosEnTransaccion,
  facturas: readonly Factura[],
): Promise<readonly FacturaConCobros[]> {
  const todos = await repos.cobros.listarDe(
    facturas.map(({ valor }) => valor.id),
  );
  return facturas.map((factura) => conSusCobros(factura, todos));
}
