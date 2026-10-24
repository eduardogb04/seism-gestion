/**
 * Los hitos y los recursos de un servicio (F3-02). Los dos se leen y se
 * escriben como la fila de cualquier ABM (con su auditoría); la baja es lógica.
 *
 * Implementados con Prisma en `src/adaptadores/prisma/planificacion.ts`.
 */

import type { Actor } from "../../dominio/compartido/actor.ts";
import type { RegistroDe, RepositorioDe } from "./abm.ts";

export type DatosHito = {
  readonly servicioId: string;
  readonly texto: string;
  /** Su lugar en la lista, de menor a mayor. */
  readonly orden: number;
  /** El día en que se tildó, `aaaa-mm-dd`; `null` si no está realizado. */
  readonly realizadoEn: string | null;
  /** Quién lo tildó; `null` si no está realizado. */
  readonly realizadoPor: Actor | null;
};

export type Hito = RegistroDe<DatosHito>;

export type RepositorioHitos = Pick<
  RepositorioDe<DatosHito>,
  "buscarPorId" | "crear" | "actualizar"
> & {
  /** Los no eliminados de un servicio, por `orden`. */
  listarDe(servicioId: string): Promise<readonly Hito[]>;
};

export type DatosRecurso = {
  readonly servicioId: string;
  /** `persona`, `camion` o `equipo`. */
  readonly tipo: string;
  /** Solo si el tipo es camión. */
  readonly camionId: string | null;
  /** Solo si el tipo no es camión. */
  readonly descripcion: string | null;
  /** Un día, `aaaa-mm-dd`. */
  readonly desde: string | null;
  readonly hasta: string | null;
};

export type Recurso = RegistroDe<DatosRecurso>;

export type RepositorioRecursos = Pick<
  RepositorioDe<DatosRecurso>,
  "buscarPorId" | "crear" | "actualizar"
> & {
  /** Los no eliminados de un servicio, del más viejo al más nuevo. */
  listarDe(servicioId: string): Promise<readonly Recurso[]>;
};
