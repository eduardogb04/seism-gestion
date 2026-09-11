// NO viola nada: un caso de uso orquesta dominio contra un puerto.
import { valor } from "../dominio/valor.ts";
import type { Repositorio } from "../puertos/repositorio.ts";

export const guardarValor = (repositorio: Repositorio): Promise<void> =>
  repositorio.guardar(String(valor));
