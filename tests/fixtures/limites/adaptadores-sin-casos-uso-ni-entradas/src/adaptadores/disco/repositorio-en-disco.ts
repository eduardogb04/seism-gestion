// NO viola nada: un adaptador implementa un puerto con tecnología concreta y
// usa dominio, puertos, infraestructura y paquetes.
import { writeFile } from "node:fs/promises";
import type { Entidad } from "../../dominio/entidad.ts";
import { nivelDeLog } from "../../infraestructura/log/nivel.ts";
import type { Repositorio } from "../../puertos/repositorio.ts";

export class RepositorioEnDisco implements Repositorio {
  readonly nivel = nivelDeLog;

  guardar(entidad: Entidad): Promise<void> {
    return writeFile(`${entidad.id}.json`, JSON.stringify(entidad));
  }
}
