/**
 * `npm run db:migrate:down` (F0-09, P1): revierte la **última** migración
 * aplicada en la base local de `docker-compose.yml`. Aplica su `down.sql` y
 * borra su fila de `_prisma_migrations` en una sola transacción, así
 * `npm run db:migrate` la vuelve a aplicar después. Una migración por corrida.
 * Decisiones: docs/adr/0009-reversion-de-migraciones.md.
 *
 * - Valida el entorno con el mismo esquema que la app antes de tocar nada,
 *   igual que `db:migrate` (lee `.env` si existe, sin pisar el entorno).
 * - Solo contra la base local: si `DATABASE_URL` no apunta a `localhost`, sale
 *   1 sin tocar nada. En el servidor no se revierte con este script.
 * - Sin driver de Postgres: corre `psql` adentro del servicio `postgres` de
 *   compose (`docker compose exec`), conectado a la `DATABASE_URL`.
 * - Si no hay migraciones aplicadas, lo dice y sale 1: no había nada que
 *   revertir.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";
import { exigirEntornoValido } from "../src/infraestructura/entorno.ts";
import {
  type EjecutarPsql,
  OPCIONES_PSQL,
  revertirUltimaMigracion,
} from "./lib/migraciones.ts";

const PROCESO = "db:migrate:down";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const { DATABASE_URL: urlBase } = exigirEntornoValido(PROCESO);

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);
if (!HOSTS_LOCALES.has(new URL(urlBase).hostname)) {
  process.stderr.write(
    `${PROCESO}: DATABASE_URL no apunta a la base local de docker-compose.yml (localhost). Este script solo revierte la base local; no se ejecutó nada.\n`,
  );
  process.exit(1);
}

/**
 * `psql` adentro del contenedor de compose. `localhost` ahí adentro es el
 * propio Postgres del servicio. La URL va por el entorno del `exec` y no en
 * los argumentos, para que no aparezca en ningún mensaje.
 */
const psqlEnCompose: EjecutarPsql = (sql) => {
  const resultado = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "-e",
      "URL_BASE",
      "postgres",
      "sh",
      "-c",
      `exec psql ${OPCIONES_PSQL.join(" ")} "$URL_BASE"`,
    ],
    {
      input: sql,
      encoding: "utf8",
      env: { ...process.env, URL_BASE: urlBase },
    },
  );
  if (resultado.error !== undefined) {
    return Promise.resolve({
      codigo: 1,
      salida: "",
      error: `no se pudo ejecutar 'docker compose exec' (${resultado.error.message}). ¿Está Docker corriendo?`,
    });
  }
  return Promise.resolve({
    codigo: resultado.status ?? 1,
    salida: resultado.stdout,
    error: resultado.stderr,
  });
};

const resultado = await revertirUltimaMigracion(psqlEnCompose);

switch (resultado.tipo) {
  case "revertida":
    process.stdout.write(
      `${PROCESO}: revertida ${resultado.nombre} (down.sql aplicado y su registro borrado de _prisma_migrations). 'npm run db:migrate' la vuelve a aplicar.\n`,
    );
    process.exit(0);
    break;
  case "nada":
    process.stderr.write(
      `${PROCESO}: la base no tiene migraciones aplicadas; no hay nada que revertir.\n`,
    );
    process.exit(1);
    break;
  case "error":
    process.stderr.write(
      `${PROCESO}: ${resultado.mensaje}\nSi la base no está levantada: docker compose up -d --wait (RUNBOOK, sección 1).\n`,
    );
    process.exit(1);
}
