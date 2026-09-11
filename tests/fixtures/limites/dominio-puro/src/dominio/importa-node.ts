// Viola `dominio-puro`: el dominio importa un módulo de Node (con `node:`).
import { randomUUID } from "node:crypto";

export const nuevoId = (): string => randomUUID();
