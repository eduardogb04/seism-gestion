/**
 * El puerto de los pagos de egresos (F2-09, ADR 0034). Un pago no es un ABM
 * (su validación depende del saldo en la base), pero se guarda y se audita
 * como uno: `RepositorioDe` da `crear` y `actualizar` con `Actor` y la
 * auditoría en la misma transacción. Anular un pago es `actualizar` uno que ya
 * trae `eliminadoEn`.
 *
 * Implementado con Prisma en `src/adaptadores/prisma/pagos.ts`.
 */

import type {
  Importe,
  Moneda,
  ValorTipoDeCambio,
} from "../../dominio/compartido/importe.ts";
import type { RepositorioDe } from "./abm.ts";

export type DatosPago = {
  readonly egresoId: string;
  /** Un día, `aaaa-mm-dd`. */
  readonly fecha: string;
  /** Lo que cancela de la deuda, en la moneda del egreso. */
  readonly importe: Importe<Moneda>;
  readonly cuentaId: string;
  /** Lo que salió de la cuenta, en la moneda de la cuenta. */
  readonly salida: Importe<Moneda>;
  /** El tipo de cambio cargado, solo si la cuenta es de otra moneda que el egreso. */
  readonly cambioValor: ValorTipoDeCambio | null;
  readonly cambioFuente: string | null;
  readonly observaciones: string | null;
};

/** Un egreso con su saldo, como lo muestra *Por pagar*. */
export type FilaPorPagar = {
  readonly id: string;
  readonly fecha: string;
  readonly concepto: string;
  readonly centroCosto: string;
  readonly proveedor: string | null;
  readonly total: Importe<Moneda>;
  readonly pagado: Importe<Moneda>;
  readonly saldo: Importe<Moneda>;
  readonly vencimiento: string | null;
};

export type ConsultaPorPagar = {
  /** Con `false`, solo los egresos con saldo. */
  readonly incluirPagados: boolean;
  readonly saltear: number;
  readonly cantidad: number;
};

export type RepositorioPagos = RepositorioDe<DatosPago> & {
  /**
   * Para registrar un pago: toma la fila del egreso y la de la cuenta hasta
   * que termine la transacción. Dos pagos al mismo egreso se esperan, y el
   * segundo relee el saldo con el primero ya guardado; una baja de la cuenta
   * en curso también espera.
   */
  bloquearParaPagar(egresoId: string, cuentaId: string): Promise<void>;
  /**
   * Los egresos no dados de baja, por vencimiento (los que no tienen, al
   * final), con lo pagado y el saldo calculados en la base. `total` y `saldos`
   * son de todas las páginas; `saldos` trae uno por moneda, sin mezclarlas.
   */
  porPagar(consulta: ConsultaPorPagar): Promise<{
    readonly filas: readonly FilaPorPagar[];
    readonly total: number;
    readonly saldos: readonly Importe<Moneda>[];
  }>;
};
