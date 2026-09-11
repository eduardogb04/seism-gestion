import type { Entidad } from "../dominio/entidad.ts";

export interface Repositorio {
  guardar(entidad: Entidad): Promise<void>;
}
