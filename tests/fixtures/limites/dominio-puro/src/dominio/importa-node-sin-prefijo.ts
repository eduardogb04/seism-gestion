// Viola `dominio-puro`: el dominio importa un módulo de Node (sin `node:`).
import { readFileSync } from "fs";

export const leer = (ruta: string): string => readFileSync(ruta, "utf8");
