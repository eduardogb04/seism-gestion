/**
 * Qué tabla de Prisma es cada entidad con ABM (F1-03, ADR 0031): el único
 * pegamento por entidad del lado de la base. Un ABM nuevo suma su línea; si a
 * su modelo le faltan las columnas de auditable o sus datos no coinciden con
 * `EntidadesAbm`, no compila.
 */

import type {
  EntidadAbm,
  RepositorioAbm,
} from "../../../puertos/repositorios/abm.ts";
import type { Prisma } from "../generado/client.ts";
import { crearRepositorioAbmPrisma } from "./repositorio.ts";

const REPOSITORIOS: {
  readonly [E in EntidadAbm]: (
    cliente: Prisma.TransactionClient,
  ) => RepositorioAbm<E>;
} = {
  Grupo: (cliente) =>
    crearRepositorioAbmPrisma(cliente, "Grupo", cliente.grupo),
  Cliente: (cliente) =>
    crearRepositorioAbmPrisma(cliente, "Cliente", cliente.cliente),
  Sitio: (cliente) =>
    crearRepositorioAbmPrisma(cliente, "Sitio", cliente.sitio),
  TipoServicio: (cliente) =>
    crearRepositorioAbmPrisma(cliente, "TipoServicio", cliente.tipoServicio),
};

/** El repositorio de `entidad` en la transacción de `cliente`. */
export function repositorioAbmPrisma<E extends EntidadAbm>(
  cliente: Prisma.TransactionClient,
  entidad: E,
): RepositorioAbm<E> {
  return REPOSITORIOS[entidad](cliente);
}
