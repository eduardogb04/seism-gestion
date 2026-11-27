/**
 * El repositorio de ampliaciones de una orden de compra (R1). Suman importe a
 * la orden, en su moneda; la fila se lee y se escribe como la de cualquier ABM.
 *
 * Implementado con Prisma en `src/adaptadores/prisma/ampliaciones-de-oc.ts`.
 */

import type { RegistroDe, RepositorioDe } from "./abm.ts";

export type DatosAmpliacionOrdenCompra = {
  readonly ordenCompraId: string;
  readonly numero: string;
  /** Un día, `aaaa-mm-dd`. */
  readonly fecha: string;
  /** Sin IVA, en la moneda de la orden (no se guarda otra). */
  readonly importeCentavos: bigint;
  /** Un día, `aaaa-mm-dd`: si cambia el fin del servicio. */
  readonly nuevaFechaFin: string | null;
  readonly observaciones: string | null;
  readonly documentoId: string | null;
};

export type AmpliacionOrdenCompra = RegistroDe<DatosAmpliacionOrdenCompra>;

export type RepositorioAmpliacionesOrdenCompra = Pick<
  RepositorioDe<DatosAmpliacionOrdenCompra>,
  "buscarPorId" | "crear" | "actualizar"
> & {
  /** Las no anuladas de las órdenes dadas, de la más nueva a la más vieja. */
  listarDe(
    ordenCompraIds: readonly string[],
  ): Promise<readonly AmpliacionOrdenCompra[]>;
};
