/**
 * Los vencimientos de un trabajo terminado (F4-02, ADR 0045). Se leen y se
 * escriben como la fila de cualquier ABM (con su auditoría); la baja es lógica.
 *
 * Implementado con Prisma en `src/adaptadores/prisma/vencimientos.ts`.
 */

import type { RegistroDe, RepositorioDe } from "./abm.ts";
import type { Rango } from "./tablero.ts";

export type DatosVencimiento = {
  readonly servicioId: string;
  /** A lo sumo uno de `sitioId` y `camionId`. */
  readonly sitioId: string | null;
  readonly camionId: string | null;
  /** Un día, `aaaa-mm-dd`. */
  readonly fecha: string;
  readonly descripcion: string;
  /** `trabajo` (lo terminado, F4-02) o `contrato` (renovar la vigencia, F4-03). */
  readonly clase: string;
  /** `calculado` (al finalizar el servicio) o `manual` (cargado o con la fecha corregida a mano). */
  readonly origen: string;
  /** `pendiente`, `renovado` o `descartado`. */
  readonly estado: string;
  /** Solo si está descartado. */
  readonly motivoDescarte: string | null;
};

export type Vencimiento = RegistroDe<DatosVencimiento>;

/** Un vencimiento pendiente como lo muestra el calendario. */
export type VencimientoPendiente = {
  readonly id: string;
  readonly servicioId: string;
  readonly servicioCodigo: string;
  /** Un día, `aaaa-mm-dd`. */
  readonly fecha: string;
  readonly descripcion: string;
};

export type RepositorioVencimientos = Pick<
  RepositorioDe<DatosVencimiento>,
  "buscarPorId" | "crear" | "actualizar"
> & {
  /** Los no eliminados de un servicio, por fecha. */
  listarDe(servicioId: string): Promise<readonly Vencimiento[]>;
  /** El vencimiento de contrato pendiente del servicio, si lo tiene (a lo sumo uno). */
  pendienteDeContratoDe(servicioId: string): Promise<Vencimiento | null>;
  /** Los pendientes no eliminados con fecha en `rango`, por fecha. */
  pendientesEntre(rango: Rango): Promise<readonly VencimientoPendiente[]>;
};
