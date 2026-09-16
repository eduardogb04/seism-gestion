/**
 * Test del mecanismo de semilla (F0-10, cimiento 3): `sembrar` corrida dos
 * veces contra un Postgres de verdad deja la base exactamente igual.
 *
 * Levanta un Postgres efímero con Testcontainers (la misma imagen que
 * `docker-compose.yml`, como en F0-09: `tests/casos-uso/migraciones.test.ts`)
 * y aplica todas las migraciones con `prisma migrate deploy`; después usa el
 * cliente real (`crearClientePrisma`, con el adaptador `@prisma/adapter-pg`)
 * para correr `sembrar` dos veces y comparar las filas de `configuracion`
 * entre las dos corridas: tienen que coincidir fila por fila, `id` y
 * `creado_en` incluidos (si `sembrar` recreara o tocara una fila sin
 * necesidad, esos campos —o `actualizado_en`— cambiarían entre corridas).
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
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { sembrar } from "../../prisma/seed.ts";
import { BIN_PRISMA } from "../../scripts/lib/migraciones.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";

/** La imagen de Postgres de `docker-compose.yml` (igual que en F0-09). */
function imagenDeCompose(): string {
  const compose = readFileSync("docker-compose.yml", "utf8");
  const coincidencia = /^\s*image:\s*(postgres:\S+)\s*$/m.exec(compose);
  expect(
    coincidencia?.[1],
    "docker-compose.yml no tiene una imagen postgres:",
  ).toBeDefined();
  return coincidencia?.[1] ?? "";
}

let contenedor: StartedPostgreSqlContainer | undefined;
let prisma: ReturnType<typeof crearClientePrisma> | undefined;

function base(): StartedPostgreSqlContainer {
  expect(contenedor, "el contenedor de Postgres no arrancó").toBeDefined();
  return contenedor as StartedPostgreSqlContainer;
}

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

describe("semilla", () => {
  beforeAll(async () => {
    contenedor = await new PostgreSqlContainer(imagenDeCompose())
      .withTmpFs({ "/var/lib/postgresql/data": "rw" })
      .start();

    const deploy = spawnSync(
      process.execPath,
      [BIN_PRISMA, "migrate", "deploy"],
      {
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: base().getConnectionUri() },
      },
    );
    expect(deploy.status, `${deploy.stdout}\n${deploy.stderr}`).toBe(0);

    prisma = crearClientePrisma(base().getConnectionUri());
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await contenedor?.stop();
  }, 60_000);

  test("es idempotente y tarda menos de 2 minutos en una base recién migrada", async () => {
    const db = cliente();
    const inicio = Date.now();

    await sembrar(db);
    expect(Date.now() - inicio).toBeLessThan(120_000);

    const primeraVez = await db.configuracion.findMany({
      orderBy: { clave: "asc" },
    });
    expect(primeraVez.map((fila) => fila.clave)).toEqual([
      "ia.tope_mensual_usd",
    ]);
    expect(primeraVez[0]?.valor).toBe("0");

    await sembrar(db);
    const segundaVez = await db.configuracion.findMany({
      orderBy: { clave: "asc" },
    });

    expect(segundaVez).toEqual(primeraVez);
  }, 120_000);
});
