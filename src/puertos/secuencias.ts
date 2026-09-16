/**
 * Puerto de secuencias (F0-19): el número que le falta a
 * `formatearCodigo` (`src/dominio/compartido/identificador.ts`) para armar
 * un `CodigoLegible`. Solo importa de `src/puertos` y `src/dominio`
 * (dependency-cruiser, regla `puertos-solo-dominio`): nada de `node:*` ni de
 * paquetes, así que ni siquiera esta interfaz sabe si el número vive en un
 * `Map` en memoria o en una tabla de Postgres.
 *
 * Implementado en memoria en Fase 0
 * (`src/adaptadores/memoria/secuencias.ts`); en Postgres desde el lote 7,
 * con una fila por prefijo y año bajo bloqueo para que dos escritores
 * concurrentes no repitan número (riesgo anotado en la tarea F0-19 del
 * plan).
 */
export type Secuencias = {
  /**
   * Da el próximo número para la combinación `prefijo` + `anio`, arrancando
   * en 1. Cada llamada devuelve un número distinto y creciente para la
   * misma combinación; combinaciones distintas son independientes entre sí.
   */
  siguiente(prefijo: string, anio: number): Promise<number>;
};
