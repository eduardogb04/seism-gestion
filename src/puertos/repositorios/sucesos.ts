/**
 * El registro de sucesos —las situaciones— de un cliente (F3-01, ADR 0039;
 * F4-05, ADR 0044): lo que pasó, con su día y su texto; el autor es quien lo
 * cargó (`creadoPor`). Cuelga del cliente y, si es de uno, de su servicio. No
 * se edita: se anula con un motivo. La fila se lee y se escribe como la de cualquier ABM
 * (con su auditoría).
 *
 * Implementado con Prisma en `src/adaptadores/prisma/sucesos.ts`.
 */

import type { RegistroDe, RepositorioDe } from "./abm.ts";

export type DatosSuceso = {
  readonly clienteId: string;
  /** Su servicio; `null`: una situación suelta del cliente. */
  readonly servicioId: string | null;
  /** Un día, `aaaa-mm-dd`. */
  readonly fecha: string;
  readonly texto: string;
  /** Por qué se anuló; `null` mientras está vigente. */
  readonly motivoAnulacion: string | null;
};

export type Suceso = RegistroDe<DatosSuceso>;

/** Una situación de un cliente con el servicio del que es, si es de uno. */
export type SituacionDelCliente = {
  readonly suceso: Suceso;
  readonly servicio: { readonly id: string; readonly codigo: string } | null;
};

export type RepositorioSucesos = Pick<
  RepositorioDe<DatosSuceso>,
  "buscarPorId" | "crear" | "actualizar"
> & {
  /** Los no anulados de un servicio, del día más nuevo al más viejo. */
  listarDe(servicioId: string): Promise<readonly Suceso[]>;
  /**
   * Los no anulados del cliente: los suyos sin servicio y los de todos sus
   * servicios (el cliente de un servicio es el que el servicio tiene hoy),
   * del día más nuevo al más viejo.
   */
  delCliente(clienteId: string): Promise<readonly SituacionDelCliente[]>;
  /** ¿Tiene el cliente alguna situación suelta (sin servicio) no anulada? */
  haySueltasDe(clienteId: string): Promise<boolean>;
};
