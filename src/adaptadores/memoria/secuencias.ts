/**
 * Doble en memoria del puerto `Secuencias` (F0-19): un `Map` por combinación
 * de prefijo y año, vivo solo mientras dura el proceso. Sirve para Fase 0
 * (un solo proceso, sin varios escritores a la vez); el adaptador de
 * Postgres del lote 7 resuelve la concurrencia con una fila bajo bloqueo.
 */

import type { Secuencias } from "../../puertos/secuencias.ts";

/** Un `Secuencias` nuevo, con su propio contador por prefijo y año. */
export function crearSecuenciasEnMemoria(): Secuencias {
  const contadores = new Map<string, number>();

  return {
    siguiente(prefijo, anio) {
      const clave = `${prefijo}-${anio}`;
      const proximo = (contadores.get(clave) ?? 0) + 1;
      contadores.set(clave, proximo);
      return Promise.resolve(proximo);
    },
  };
}
