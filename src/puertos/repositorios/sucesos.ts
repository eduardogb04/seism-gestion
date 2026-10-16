/**
 * El registro de sucesos de un servicio (F3-01, ADR 0039): lo que pasó, con su
 * día y su texto; el autor es quien lo cargó (`creadoPor`). No se edita: se
 * anula con un motivo. La fila se lee y se escribe como la de cualquier ABM
 * (con su auditoría).
 *
 * Implementado con Prisma en `src/adaptadores/prisma/sucesos.ts`.
 */

import type { RegistroDe, RepositorioDe } from "./abm.ts";

export type DatosSuceso = {
  readonly servicioId: string;
  /** Un día, `aaaa-mm-dd`. */
  readonly fecha: string;
  readonly texto: string;
  /** Por qué se anuló; `null` mientras está vigente. */
  readonly motivoAnulacion: string | null;
};

export type Suceso = RegistroDe<DatosSuceso>;

export type RepositorioSucesos = Pick<
  RepositorioDe<DatosSuceso>,
  "buscarPorId" | "crear" | "actualizar"
> & {
  /** Los no anulados de un servicio, del día más nuevo al más viejo. */
  listarDe(servicioId: string): Promise<readonly Suceso[]>;
};
