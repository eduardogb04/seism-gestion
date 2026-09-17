/**
 * El arnés del nivel **casos de uso** (F0-14), primera mitad: **un solo
 * Postgres para toda la tanda**.
 *
 * Esto es un `globalSetup` de Vitest (proyecto `casos-uso` en
 * `vitest.config.ts`): corre una vez en el proceso principal, antes que
 * cualquier archivo de test, y su función de cierre corre una vez al final.
 * Levanta el contenedor, crea adentro la base que comparten los tests
 * (`BASE_COMPARTIDA`, con la cadena de migraciones ya aplicada) y les pasa por
 * `provide` lo que necesitan para hablarle. Al terminar para y borra el
 * contenedor; si el proceso muriera antes, lo borra Ryuk (el recolector de
 * Testcontainers). Los datos van en `tmpfs`: nada queda en disco y **no hay
 * estado entre corridas**.
 *
 * La otra mitad del arnés —lo que usan los tests: la base limpia con
 * `TRUNCATE`, una base vacía para el test de migraciones y `psql` adentro del
 * contenedor— está en `base.ts`.
 *
 * Necesita Docker corriendo (RUNBOOK, sección 1).
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import { BIN_PRISMA, OPCIONES_PSQL } from "../../../scripts/lib/migraciones.ts";

/** La base que comparten los tests: migrada una vez, limpia por test. */
export const BASE_COMPARTIDA = "casos_uso";

/** Lo que el arnés le pasa a los tests para hablarle al contenedor. */
export interface DatosPostgres {
  /** Id del contenedor: con eso los tests ejecutan `psql` adentro. */
  readonly id: string;
  readonly host: string;
  readonly puerto: number;
  readonly usuario: string;
  readonly clave: string;
}

declare module "vitest" {
  interface ProvidedContext {
    postgres: DatosPostgres;
  }
}

/** La imagen de Postgres de `docker-compose.yml`, con su tag y su digest. */
function imagenDeCompose(): string {
  const compose = readFileSync("docker-compose.yml", "utf8");
  const coincidencia = /^\s*image:\s*(postgres:\S+)\s*$/m.exec(compose);
  if (coincidencia?.[1] === undefined) {
    throw new Error("docker-compose.yml no tiene una imagen postgres:");
  }
  return coincidencia[1];
}

/** Corre un `psql` de una línea adentro del contenedor; corta si falla. */
async function psql(
  contenedor: StartedPostgreSqlContainer,
  base: string,
  sql: string,
): Promise<void> {
  const resultado = await contenedor.exec([
    "psql",
    ...OPCIONES_PSQL,
    "-U",
    contenedor.getUsername(),
    "-d",
    base,
    "-c",
    sql,
  ]);
  if (resultado.exitCode !== 0) {
    throw new Error(
      `el arnés de casos de uso no pudo correr "${sql}" (psql salió ${resultado.exitCode}):\n${resultado.stderr}`,
    );
  }
}

/** Levanta el contenedor y deja `BASE_COMPARTIDA` migrada. */
export default async function levantarPostgres(
  proyecto: TestProject,
): Promise<() => Promise<void>> {
  const contenedor = await new PostgreSqlContainer(imagenDeCompose())
    .withTmpFs({ "/var/lib/postgresql/data": "rw" })
    .start();

  await psql(
    contenedor,
    contenedor.getDatabase(),
    `create database ${BASE_COMPARTIDA}`,
  );

  const uriCompartida = `postgresql://${contenedor.getUsername()}:${contenedor.getPassword()}@${contenedor.getHost()}:${contenedor.getPort()}/${BASE_COMPARTIDA}`;
  const deploy = spawnSync(
    process.execPath,
    [BIN_PRISMA, "migrate", "deploy"],
    {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: uriCompartida },
    },
  );
  if (deploy.status !== 0) {
    await contenedor.stop();
    throw new Error(
      `el arnés de casos de uso no pudo migrar ${BASE_COMPARTIDA}:\n${deploy.stdout}\n${deploy.stderr}`,
    );
  }

  proyecto.provide("postgres", {
    id: contenedor.getId(),
    host: contenedor.getHost(),
    puerto: contenedor.getPort(),
    usuario: contenedor.getUsername(),
    clave: contenedor.getPassword(),
  });

  return async () => {
    await contenedor.stop();
  };
}
