// Viola `puertos-solo-dominio`: un puerto importa un módulo de Node, aunque
// sea solo un tipo.
import type { Readable } from "node:stream";

export interface Almacen {
  leer(clave: string): Promise<Readable>;
}
