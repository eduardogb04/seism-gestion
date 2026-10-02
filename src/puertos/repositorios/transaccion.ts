/**
 * Unidad de trabajo (F0-30, ADR 0024): corre un trabajo contra los
 * repositorios **en una sola transacción**. Si el trabajo lanza, no queda
 * nada escrito: ni el cambio del usuario, ni el cierre de sus sesiones, ni el
 * registro de auditoría. Es lo que hace que `revocar` sea todo o nada.
 *
 * Implementado con Prisma en `src/adaptadores/prisma/transaccion.ts`
 * (`$transaction` interactiva).
 */
import type { Auditoria } from "../auditoria.ts";
import type { EntidadAbm, RepositorioAbm } from "./abm.ts";
import type { RepositorioSesiones } from "./sesiones.ts";
import type { RepositorioUsuarios } from "./usuarios.ts";

/** Los repositorios atados a la transacción en curso. */
export type RepositoriosEnTransaccion = {
  readonly usuarios: RepositorioUsuarios;
  readonly sesiones: RepositorioSesiones;
  /** Para leer el historial de una entidad (F1-05); escribir lo hace cada repositorio. */
  readonly auditoria: Auditoria;
  /** El repositorio de cualquier entidad con ABM (F1-03, ADR 0031). */
  abm<E extends EntidadAbm>(entidad: E): RepositorioAbm<E>;
};

export type Transaccional = {
  ejecutar<T>(
    trabajo: (repos: RepositoriosEnTransaccion) => Promise<T>,
  ): Promise<T>;
};
