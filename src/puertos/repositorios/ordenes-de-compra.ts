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
};

export type OrdenCompra = RegistroDe<DatosOrdenCompra>;

export type RepositorioOrdenesCompra = Pick<
  RepositorioDe<DatosOrdenCompra>,
  "buscarPorId" | "crear" | "actualizar"
> & {
  /** Las no anuladas de un servicio, de la más nueva a la más vieja. */
  listarDe(servicioId: string): Promise<readonly OrdenCompra[]>;
};
