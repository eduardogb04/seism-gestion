// NO viola nada: un puerto nombra tipos del dominio y de otro puerto.
import type { Entidad } from "../dominio/entidad.ts";
import type { Almacen } from "./usa-node.ts";

export interface Repositorio {
  guardar(entidad: Entidad, almacen: Almacen): Promise<void>;
}
