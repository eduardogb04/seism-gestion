/**
 * Los comprobantes de un servicio (F6-03, ADR 0050): la factura, la factura
 * adicional, la nota de débito y la nota de crédito viven en la misma tabla y
 * guardan el importe siempre positivo. El signo lo pone el tipo, acá y en
 * ningún otro lado.
 *
 * - La nota de crédito no tiene saldo propio: baja el de su asociado (una
 *   factura, una adicional o una nota de débito), y nunca más que ese saldo.
 * - La factura adicional y la nota de débito se cobran como una factura.
 * - Lo que consume la orden de compra es la factura no adicional y las notas
 *   que cuelgan de ella; la adicional y lo que cuelga de ella, no.
 */

import { catalogo } from "../compartido/errores/catalogo.ts";
import type { Resultado } from "../compartido/historial.ts";
import {
  crearImporte,
  type Importe,
  type Moneda,
} from "../compartido/importe.ts";
import { pagar } from "../compartido/saldo.ts";
import {
  type CobroDeFactura,
  type SaldoDeFactura,
  saldoDeFactura,
} from "./cobro.ts";

export const TIPOS_DE_COMPROBANTE = [
  "factura",
  "nota_debito",
  "nota_credito",
] as const;

export type TipoDeComprobante = (typeof TIPOS_DE_COMPROBANTE)[number];

/** Los tipos que restan de lo facturado; la base los usa para sumar con signo. */
export const TIPOS_QUE_RESTAN: readonly TipoDeComprobante[] = ["nota_credito"];

/** Lo que el dominio mira de un comprobante vigente. */
export interface Comprobante {
  readonly id: string;
  readonly tipo: TipoDeComprobante;
  readonly adicional: boolean;
  readonly asociadoId: string | null;
}

/** Un comprobante con su total con IVA (positivo, como se guarda). */
export interface ComprobanteConTotal extends Comprobante {
  readonly total: Importe<Moneda>;
}

export interface SaldoDeComprobante<C extends ComprobanteConTotal> {
  readonly comprobante: C;
  readonly saldo: SaldoDeFactura<Moneda>;
}

/** El importe con el signo de su tipo: negativo en la nota de crédito. */
export function importeConSigno<M extends Moneda>(
  tipo: TipoDeComprobante,
  importe: Importe<M>,
): Importe<M> {
  return TIPOS_QUE_RESTAN.includes(tipo)
    ? crearImporte(-importe.centavos, importe.moneda)
    : importe;
}

/** Si el comprobante tiene saldo propio y se cobra: todos menos la nota de crédito. */
export function tieneSaldo({ tipo }: Comprobante): boolean {
  return !TIPOS_QUE_RESTAN.includes(tipo);
}

/**
 * El saldo de cada comprobante con saldo propio, en el orden dado: su total,
 * menos las notas de crédito vigentes asociadas (de entre `comprobantes`),
 * menos sus cobros, con la regla de `saldoDeFactura`. Si alguno no cierra, se
 * rechaza el conjunto.
 */
export function saldosDeComprobantes<C extends ComprobanteConTotal>(
  comprobantes: readonly C[],
  cobrosDe: (id: string) => readonly CobroDeFactura<Moneda>[],
): Resultado<readonly SaldoDeComprobante<C>[], { readonly id: string }> {
  const saldos: SaldoDeComprobante<C>[] = [];
  for (const comprobante of comprobantes.filter(tieneSaldo)) {
    const saldo = saldoDeFactura(
      comprobante.total,
      cobrosDe(comprobante.id),
      comprobantes
        .filter(
          (otro) => !tieneSaldo(otro) && otro.asociadoId === comprobante.id,
        )
        .map(({ total }) => total),
    );
    if (!saldo.ok) {
      return { ok: false, error: { id: comprobante.id } };
    }
    saldos.push({ comprobante, saldo: saldo.valor });
  }
  return { ok: true, valor: saldos };
}

/**
 * Si el comprobante consume la orden de compra: la cadena de asociados (una
 * nota de crédito de una nota de débito de una factura) termina en una factura
 * no adicional.
 */
export function cuentaParaLaOrden(
  comprobante: Comprobante,
  todos: readonly Comprobante[],
): boolean {
  let actual: Comprobante | undefined = comprobante;
  const vistos = new Set<string>();
  while (actual !== undefined && !vistos.has(actual.id)) {
    if (actual.asociadoId === null) {
      return actual.tipo === "factura" && !actual.adicional;
    }
    vistos.add(actual.id);
    const asociadoId: string = actual.asociadoId;
    actual = todos.find(({ id }) => id === asociadoId);
  }
  return false;
}

export interface AsociadoInvalido {
  readonly codigo: typeof catalogo.DOM_0042.codigo;
}

export interface CreditoDeMas {
  readonly codigo: typeof catalogo.DOM_0043.codigo;
}

/** El asociado, entre los que tienen saldo, si es de esa moneda; si no, `DOM-0042`. */
function asociadoDe<C extends ComprobanteConTotal>(
  saldos: readonly SaldoDeComprobante<C>[],
  asociadoId: string,
  moneda: Moneda,
): Resultado<SaldoDeComprobante<C>, AsociadoInvalido> {
  const asociado = saldos.find(
    ({ comprobante }) => comprobante.id === asociadoId,
  );
  return asociado === undefined || asociado.comprobante.total.moneda !== moneda
    ? { ok: false, error: { codigo: catalogo.DOM_0042.codigo } }
    : { ok: true, valor: asociado };
}

/**
 * Una nota de crédito de `total` (con IVA) sobre `asociadoId`: el asociado
 * tiene que ser un comprobante con saldo de `saldos` (los vigentes del
 * servicio) en la misma moneda (`DOM-0042`), y la nota no puede pasar su saldo
 * pendiente (`DOM-0043`).
 */
export function admiteNotaDeCredito<C extends ComprobanteConTotal>(
  saldos: readonly SaldoDeComprobante<C>[],
  asociadoId: string,
  total: Importe<Moneda>,
): Resultado<C, AsociadoInvalido | CreditoDeMas> {
  const asociado = asociadoDe(saldos, asociadoId, total.moneda);
  if (!asociado.ok) {
    return asociado;
  }
  const { saldo, comprobante } = asociado.valor;
  const pagado = pagar(
    { total: saldo.total, pagado: saldo.cobrado, saldo: saldo.saldo },
    total,
  );
  return pagado.ok
    ? { ok: true, valor: comprobante }
    : { ok: false, error: { codigo: catalogo.DOM_0043.codigo } };
}

/** Una nota de débito: sin asociado, o con uno con saldo de la misma moneda (`DOM-0042`). */
export function admiteNotaDeDebito<C extends ComprobanteConTotal>(
  saldos: readonly SaldoDeComprobante<C>[],
  asociadoId: string | null,
  moneda: Moneda,
): Resultado<C | null, AsociadoInvalido> {
  if (asociadoId === null) {
    return { ok: true, valor: null };
  }
  const asociado = asociadoDe(saldos, asociadoId, moneda);
  return asociado.ok
    ? { ok: true, valor: asociado.valor.comprobante }
    : asociado;
}

/** `DOM-0044` si entre `vigentes` hay notas de crédito asociadas a `id`: se anulan primero ellas. */
export function admiteAnulacion(
  vigentes: readonly Comprobante[],
  id: string,
): Resultado<null, { readonly codigo: typeof catalogo.DOM_0044.codigo }> {
  return vigentes.some((otro) => !tieneSaldo(otro) && otro.asociadoId === id)
    ? { ok: false, error: { codigo: catalogo.DOM_0044.codigo } }
    : { ok: true, valor: null };
}
