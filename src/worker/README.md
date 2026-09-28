# src/worker

Proceso aparte de `src/app`: planificador (`croner`) y jobs (ingestas, tareas
programadas). Mismas reglas de importación que `src/app`: adaptadores solo
por `src/infraestructura/arranque/`, dominio solo con `import type`.

Desde F0-25 (ADR 0025):

- `index.ts`: la entrada (`npm run worker` = `node src/worker/index.ts`, con
  el TypeScript nativo de Node 24). Valida el entorno con el esquema de la
  app, instala los manejadores de excepciones, arma los adaptadores y levanta
  el planificador. En Docker, la misma imagen que la app con ese comando.
- `planificador.ts`: un `Cron` por job, con `protect`. Si un job lanza, lo
  loguea con su código y sigue.
- `registrar-corrida.ts`: el envoltorio de toda corrida (fila en
  `corridas_worker` con `inicio` antes y `fin`/`resultado` en `finally`).
- `jobs.ts`: los jobs. Hoy, `latido` (cada 5 minutos, solo se registra).

Cómo se agrega un job: AGENTS.md, *Cómo se agrega... un job al worker*.
