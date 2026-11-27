/**
 * El repositorio de ajustes de facturación propuestos (R5): recargos y
 * descuentos que un administrador aprueba o rechaza. La fila se lee y se
 * escribe como la de cualquier ABM (con su auditoría).
 *
 * Implementado con Prisma en `src/adaptadores/prisma/ajustes-facturacion.ts`.
 */

import type { Importe, Moneda } from "../../dominio/compartido/importe.ts";
import type { FechaHora } from "../../dominio/compartido/reloj.ts";
import type {
  ClaseDeAjuste,
  EstadoDeAjuste,
} from "../../dominio/servicios/ajuste-facturacion.ts";
import type { RegistroDe, RepositorioDe } from "./abm.ts";

export type DatosAjusteFacturacion = {
  readonly servicioId: string;
  readonly clase: ClaseDeAjuste;
  readonly concepto: string;
  /** Texto libre (`3 días`); `null` si no se cargó. */
  readonly cantidad: string | null;
  readonly precioUnitario: Importe<Moneda> | null;
  /** Sin IVA, en la moneda de la orden de compra vigente. */
  readonly importe: Importe<Moneda>;
  readonly motivo: string;
  readonly documentoId: string | null;
  readonly estado: EstadoDeAjuste;
  readonly resueltoEn: FechaHora | null;
  /** El usuario administrador que aprobó o rechazó. */
  readonly resueltoPor: string | null;
  readonly motivoRechazo: string | null;
  /** La factura adicional o la nota de crédito que salió de este ajuste. */
  readonly facturaId: string | null;
};

export type AjusteFacturacion = RegistroDe<DatosAjusteFacturacion>;

export type PendienteDeValidar = {
  readonly ajuste: AjusteFacturacion;
  readonly servicioCodigo: string;
};

export type RepositorioAjustesFacturacion = Pick<
  RepositorioDe<DatosAjusteFacturacion>,
  "buscarPorId" | "crear" | "actualizar"
> & {
  /** Los no anulados del servicio, del más nuevo al más viejo. */
  listarDe(servicioId: string): Promise<readonly AjusteFacturacion[]>;
  /** Los pendientes no anulados de todos los servicios, del más viejo al más nuevo. */
  pendientes(): Promise<readonly PendienteDeValidar[]>;
};
