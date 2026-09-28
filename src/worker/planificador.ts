/**
 * El planificador del worker (F0-25, ADR 0025): un `Cron` de `croner` por
 * job (P11). Cada corrida pasa por `registrarCorrida` (queda en
 * `corridas_worker`, pase lo que pase) y, si el job lanza, el error se
 * loguea con su código y el planificador **sigue**: la corrida siguiente
 * corre igual. Un job que tarda más que su intervalo no se solapa consigo
 * mismo (`protect`).
 *
 * Una sola réplica del worker en Fase 0: dos réplicas correrían cada job dos
 * veces (riesgo de Fase 1, con salida por bloqueo consultivo de Postgres;
 * ADR 0025).
 */

import { Cron } from "croner";
import { registrarFalla } from "../infraestructura/fallas.ts";
import type { Log } from "../infraestructura/log.ts";
import type { Job } from "./jobs.ts";
import type { RegistrarCorrida } from "./registrar-corrida.ts";

export type DependenciasPlanificador = {
  readonly registrarCorrida: RegistrarCorrida;
  readonly log: Log;
};

export type Planificador = {
  /** Detiene todos los jobs (al apagar el proceso). */
  detener(): void;
};

export function iniciarPlanificador(
  jobs: readonly Job[],
  deps: DependenciasPlanificador,
): Planificador {
  const correr = async (job: Job): Promise<void> => {
    try {
      await deps.registrarCorrida(job.nombre, job.ejecutar);
    } catch (causa) {
      registrarFalla(deps.log, causa, { job: job.nombre });
    }
  };

  const programados = jobs.map(
    (job) =>
      new Cron(job.cron, { name: job.nombre, protect: true }, () =>
        correr(job),
      ),
  );

  return {
    detener() {
      for (const cron of programados) {
        cron.stop();
      }
    },
  };
}
