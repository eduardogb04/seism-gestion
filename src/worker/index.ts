/**
 * El proceso worker (F0-25, ADR 0025): `npm run worker` =
 * `node src/worker/index.ts`, con el soporte nativo de TypeScript de Node 24
 * (sin compilador). En Docker, la misma imagen que la app con este comando.
 *
 * 1. Valida el entorno con **el mismo** esquema que la app
 *    (`src/infraestructura/entorno.ts`): si falta `DATABASE_URL` o es
 *    inválida, dice cuál en stderr y sale con código 1.
 * 2. Instala los manejadores de excepciones no capturadas (F0-24).
 * 3. Arma los adaptadores (`src/infraestructura/arranque/worker.ts`) y
 *    levanta el planificador con los jobs de `jobs.ts`.
 * 4. Con `SIGTERM` o `SIGINT` (el `docker stop`), detiene los jobs, cierra
 *    la base y sale con 0.
 */

import { armarWorker } from "../infraestructura/arranque/worker.ts";
import { exigirEntornoValido } from "../infraestructura/entorno.ts";
import { registrarFalla } from "../infraestructura/fallas.ts";
import { log } from "../infraestructura/log.ts";
import { instalarManejadoresDeProceso } from "../infraestructura/proceso.ts";
import { JOBS } from "./jobs.ts";
import { iniciarPlanificador } from "./planificador.ts";
import { crearRegistrarCorrida } from "./registrar-corrida.ts";

const entorno = exigirEntornoValido("el worker");
instalarManejadoresDeProceso(log);

const armado = armarWorker(entorno.DATABASE_URL);
const planificador = iniciarPlanificador(JOBS, {
  registrarCorrida: crearRegistrarCorrida({
    corridas: armado.corridas,
    ahora: () => new Date(),
  }),
  log,
});

log.info(
  { jobs: JOBS.map(({ nombre, cron }) => ({ nombre, cron })) },
  "worker arrancado",
);

function apagar(senal: NodeJS.Signals): void {
  log.info({ senal }, "worker apagándose");
  planificador.detener();
  armado.cerrar().then(
    () => process.exit(0),
    (causa: unknown) => {
      registrarFalla(log, causa, { al: "cerrar la base" });
      process.exit(1);
    },
  );
}

process.once("SIGTERM", apagar);
process.once("SIGINT", apagar);
