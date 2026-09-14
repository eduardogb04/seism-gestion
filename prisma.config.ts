/**
 * Configuración de la CLI de Prisma (F0-08). Decisiones:
 * docs/adr/0008-prisma-y-reversion.md.
 *
 * - Esquema en `prisma/schema.prisma`, migraciones en `prisma/migrations/`
 *   (cada una con `migration.sql` y `down.sql`: docs/convenciones-base.md).
 * - La URL de la base sale de `DATABASE_URL`. Prisma 7 no lee `.env` solo:
 *   se carga acá si existe, sin pisar lo que ya venga en el entorno del
 *   proceso.
 * - Sin `DATABASE_URL` la configuración igual carga, sin `datasource`: así
 *   `prisma generate` (que corre en `npm ci`, en CI y en el build de la
 *   imagen) no necesita ninguna base. Los comandos que sí la necesitan se
 *   corren por `npm run db:*`, que validan el entorno completo antes
 *   (`src/infraestructura/entorno.ts`) y no arrancan si falta o es inválida.
 */

import { existsSync } from "node:fs";
import process from "node:process";
import { defineConfig } from "prisma/config";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const urlBase = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(urlBase === undefined || urlBase === ""
    ? {}
    : { datasource: { url: urlBase } }),
});
