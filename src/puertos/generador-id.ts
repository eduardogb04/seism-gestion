/**
 * Puerto del generador de identificadores (F0-19): el UUID interno de
 * `Identificador<Marca>` (`src/dominio/compartido/identificador.ts`) no lo
 * genera el dominio — `src/dominio` no puede importar `node:crypto`
 * (dependency-cruiser, regla `dominio-puro`) — sino un adaptador que
 * implementa esta interfaz.
 *
 * Implementado en Fase 0 con `node:crypto` en
 * `src/adaptadores/memoria/generador-id.ts`. No hace falta un adaptador
 * distinto para Postgres: generar un UUID no depende de dónde se guarda.
 */
export type GeneradorId = {
  /** Genera un identificador nuevo (UUID), como string sin formatear. */
  generar(): string;
};
