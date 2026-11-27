/**
 * El repositorio de órdenes de compra de un servicio (F2-06, ADR 0036). La fila
 * se lee y se escribe como la de cualquier ABM (con su auditoría); lo demás es
 * propio. El importe es sin IVA; el documento es opcional.
 *
 * Implementado con Prisma en `src/adaptadores/prisma/ordenes-de-compra.ts`.
 */

import type {
  CambioDeDocumento,
  Importe,
  Moneda,
} from "../../dominio/compartido/importe.ts";
import type { FechaHora } from "../../dominio/compartido/reloj.ts";
import type { RegistroDe, RepositorioDe } from "./abm.ts";

export type DatosOrdenCompra = {
  readonly servicioId: string;
  readonly numero: string;
  /** Un día, `aaaa-mm-dd`. */
  readonly fecha: string;
  /** Sin IVA. */
  readonly importe: Importe<Moneda>;
  /** Pesos por dólar de su fecha (F3-04): solo si el importe es en dólares; las ya cargadas no lo tienen. */
  readonly cambio: CambioDeDocumento | null;
  readonly observaciones: string | null;
  readonly documentoId: string | null;
  /** Cuándo la reemplazó otra (R1): sigue en la historia con sus facturas. */
  readonly reemplazadaEn: FechaHora | null;
  readonly reemplazadaPorId: string | null;
};

export type OrdenCompra = RegistroDe<DatosOrdenCompra>;

export type RepositorioOrdenesCompra = Pick<
  RepositorioDe<DatosOrdenCompra>,
  "buscarPorId" | "crear" | "actualizar"
> & {
  /** Las no anuladas de un servicio, de la más nueva a la más vieja, con las reemplazadas (la historia). */
  listarDe(servicioId: string): Promise<readonly OrdenCompra[]>;
  /** La vigente: la no anulada y no reemplazada más nueva, o `undefined` si no hay (R1). */
  vigenteDe(servicioId: string): Promise<OrdenCompra | undefined>;
};
