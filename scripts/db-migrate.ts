/**
 * `npm run db:migrate` (F0-08): aplica las migraciones pendientes de
 * `prisma/migrations/` con `prisma migrate deploy`. Es el comando que corre
 * contra una base vacía o ya migrada; nunca crea migraciones nuevas (eso es
 * `prisma migrate dev`, ver docs/convenciones-base.md).
 *
 * Antes de tocar nada valida el entorno con el mismo esquema que la app
 * (`src/infraestructura/entorno.ts`): si `DATABASE_URL` (o cualquier otra
 * variable) falta o es inválida, sale 1 diciendo cuál y Prisma ni se
 * ejecuta. Lee `.env` si existe, sin pisar lo que ya venga en el entorno del
 * proceso (en el servidor las variables vienen del entorno, no de un
 * archivo).
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";
import { exigirEntornoValido } from "../src/infraestructura/entorno.ts";
import { BIN_PRISMA } from "./lib/migraciones.ts";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

exigirEntornoValido("db:migrate");

const resultado = spawnSync(
  process.execPath,
  [BIN_PRISMA, "migrate", "deploy"],
  {
    stdio: "inherit",
  },
);

if (resultado.error !== undefined) {
  process.stderr.write(
    `db:migrate: no se pudo ejecutar la CLI de Prisma (${resultado.error.message}).\n`,
  );
  process.exit(1);
}
process.exit(resultado.status ?? 1);
