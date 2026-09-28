/**
 * Los jobs del worker (F0-25). Cada uno es un nombre, una expresión cron
 * (sintaxis de `croner`: cinco campos, o seis con segundos) y qué hacer. El
 * planificador corre cada uno a través de `registrarCorrida`, así que todos
 * quedan en `corridas_worker` sin hacer nada aparte.
 *
 * Cómo se agrega un job: AGENTS.md, *Cómo se agrega... un job al worker*.
 */

export type Job = {
  /** El nombre con que queda en `corridas_worker` y en el panel de salud. */
  readonly nombre: string;
  /** Cuándo corre, en sintaxis cron. */
  readonly cron: string;
  readonly ejecutar: () => Promise<void>;
};

/**
 * El latido del worker: cada 5 minutos, no hace nada más que registrarse. Si
 * su última corrida es vieja, el worker está caído (lo mira el panel de
 * salud, F0-26).
 */
export const latido: Job = {
  nombre: "latido",
  cron: "*/5 * * * *",
  ejecutar: () => Promise.resolve(),
};

/** Los jobs que levanta `src/worker/index.ts`. */
export const JOBS: readonly Job[] = [latido];
