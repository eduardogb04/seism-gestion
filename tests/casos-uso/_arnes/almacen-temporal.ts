/** Un almacén de documentos en disco, en una carpeta temporal que el test borra al terminar (F2-05). */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { crearAlmacenDisco } from "../../../src/adaptadores/disco/almacen-documentos.ts";
import type { AlmacenDocumentos } from "../../../src/puertos/almacen-documentos.ts";

export type AlmacenTemporal = {
  readonly almacen: AlmacenDocumentos;
  readonly carpeta: string;
  borrar(): Promise<void>;
};

export async function crearAlmacenTemporal(): Promise<AlmacenTemporal> {
  const carpeta = await mkdtemp(path.join(tmpdir(), "seism-almacen-"));
  return {
    almacen: crearAlmacenDisco({ directorio: carpeta }),
    carpeta,
    borrar: () => rm(carpeta, { recursive: true, force: true }),
  };
}
