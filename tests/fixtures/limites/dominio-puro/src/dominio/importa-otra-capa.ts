// Viola `dominio-puro`: el dominio importa de otra carpeta de `src/`, aunque
// sea solo un tipo.
import type { Repositorio } from "../puertos/repositorio.ts";

export type ConRepositorio = { readonly repositorio: Repositorio };
