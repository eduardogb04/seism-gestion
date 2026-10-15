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
import type { Secuencias } from "../secuencias.ts";
import type { EntidadAbm, RepositorioAbm } from "./abm.ts";
import type { RepositorioCotizaciones } from "./cotizaciones.ts";
import type { RepositorioDocumentos } from "./documentos.ts";
import type { RepositorioFacturas } from "./facturas.ts";
import type { RepositorioOrdenesCompra } from "./ordenes-de-compra.ts";
import type { RepositorioPagos } from "./pagos.ts";
import type { RepositorioServicios } from "./servicios.ts";
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
  /** Los pagos de egresos (F2-09, ADR 0034). */
  readonly pagos: RepositorioPagos;
  readonly servicios: RepositorioServicios;
  /** El número de un código legible nuevo: se da en la transacción del alta (F2-04). */
  readonly secuencias: Secuencias;
  /** Los archivos adjuntos (F2-05): el registro dueño los crea en su misma transacción. */
  readonly documentos: RepositorioDocumentos;
  readonly cotizaciones: RepositorioCotizaciones;
  readonly ordenesCompra: RepositorioOrdenesCompra;
  readonly facturas: RepositorioFacturas;
};

export type Transaccional = {
  ejecutar<T>(
    trabajo: (repos: RepositoriosEnTransaccion) => Promise<T>,
  ): Promise<T>;
};
