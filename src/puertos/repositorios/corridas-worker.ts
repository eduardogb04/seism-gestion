/**
 * Puerto del registro de corridas del worker (F0-25, ADR 0025): una fila por
 * cada corrida de cada job. `iniciar` va **antes** de correr el job y
 * `terminar` **después**, pase lo que pase (lo garantiza `registrarCorrida`,
 * `src/worker/registrar-corrida.ts`). Una corrida sin `fin` está en curso, o
 * el proceso murió a mitad.
 *
 * Implementado en Postgres (`src/adaptadores/prisma/corridas-worker.ts`,
 * tabla `corridas_worker`).
 */

export type ResultadoCorrida = "ok" | "error";

export type Corrida = {
  readonly job: string;
  readonly inicio: Date;
  readonly fin: Date | null;
  readonly resultado: ResultadoCorrida | null;
  /** Con error: el código del catálogo y el mensaje, redactado. */
  readonly detalle: string | null;
};

export type FinDeCorrida = {
  readonly fin: Date;
  readonly resultado: ResultadoCorrida;
  readonly detalle: string | null;
};

export type RegistroCorridas = {
  /** Registra que `job` empezó en `inicio`. Devuelve el id de la corrida. */
  iniciar(job: string, inicio: Date): Promise<string>;
  /** Cierra la corrida `id` con su fin, su resultado y su detalle. */
  terminar(id: string, fin: FinDeCorrida): Promise<void>;
  /** La corrida más reciente de `job` (por `inicio`), o `null` si nunca corrió. */
  ultimaCorrida(job: string): Promise<Corrida | null>;
};
