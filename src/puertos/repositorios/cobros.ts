/**
 * El repositorio de cobros de facturas (F2-07, ADR 0037). La fila se lee y se
 * escribe como la de cualquier ABM (con su auditoría). El importe y la
 * retención están en la moneda de la factura; `entrada` es lo que entró a la
 * cuenta. Anular un cobro es `actualizar` uno que ya trae `eliminadoEn`.
 *
 * Implementado con Prisma en `src/adaptadores/prisma/cobros.ts`.
 */

import type {
  Importe,
  Moneda,
  ValorTipoDeCambio,
} from "../../dominio/compartido/importe.ts";
import type { RegistroDe, RepositorioDe } from "./abm.ts";

export type DatosCobro = {
  readonly facturaId: string;
  /** Un día, `aaaa-mm-dd`. */
  readonly fecha: string;
  /** Lo que cancela de la deuda, en la moneda de la factura. */
  readonly importe: Importe<Moneda>;
  /** Lo que el cliente retuvo y también cancela deuda, en la moneda de la factura. */
  readonly retencion: Importe<Moneda> | null;
  readonly cuentaId: string;
  /** Lo que entró a la cuenta, en la moneda de la cuenta. */
  readonly entrada: Importe<Moneda>;
  /** El tipo de cambio cargado, solo si la cuenta es de otra moneda que la factura. */
  readonly cambioValor: ValorTipoDeCambio | null;
  readonly cambioFuente: string | null;
  readonly observaciones: string | null;
};

export type Cobro = RegistroDe<DatosCobro>;

export type RepositorioCobros = Pick<
  RepositorioDe<DatosCobro>,
  "buscarPorId" | "crear" | "actualizar"
> & {
  /** Los no anulados de esas facturas, del más viejo al más nuevo. */
  listarDe(facturaIds: readonly string[]): Promise<readonly Cobro[]>;
  /**
   * Para registrar un cobro: toma la fila de la cuenta hasta que termine la transacción, así
   * una baja de la cuenta en curso espera y ve el cobro.
   */
  bloquearCuenta(cuentaId: string): Promise<void>;
};
