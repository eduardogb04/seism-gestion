/**
 * Adaptador del puerto `GeneradorId` (F0-19) con `node:crypto`: el dominio
 * no puede llamarlo (regla `dominio-puro`), así que el UUID se genera acá y
 * entra al dominio como parámetro (`identificadorDesde`, en
 * `src/dominio/compartido/identificador.ts`).
 *
 * No es un "doble" de test como `secuencias.ts`: genera UUIDs reales, y
 * alcanza para Fase 0 y para lo que sigue (generar un UUID no depende de
 * dónde se guarda). Vive en `memoria/` igual, junto al otro puerto nuevo de
 * esta tarea.
 */

import { randomUUID } from "node:crypto";
import type { GeneradorId } from "../../puertos/generador-id.ts";

/** Un `GeneradorId` que arma cada identificador con `crypto.randomUUID()`. */
export function crearGeneradorIdCrypto(): GeneradorId {
  return {
    generar: () => randomUUID(),
  };
}
