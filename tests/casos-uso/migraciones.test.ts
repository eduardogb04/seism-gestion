/**
 * Test de migraciones (F0-09, cimiento 3, P1): la cadena entera se aplica y se
 * revierte entera contra un Postgres de verdad.
 *
 * - Postgres 16 efímero con Testcontainers, **la misma imagen** que
 *   `docker-compose.yml` (se lee de ahí: si se sube la de compose, el test la
 *   sigue). Datos en `tmpfs`: nada queda en disco. `afterAll` para y borra el
 *   contenedor; si el proceso muere antes, lo borra Ryuk (el recolector de
 *   Testcontainers). Sin estado entre corridas.
 * - Recorre `prisma/migrations/`: no nombra ninguna migración. Una migración
 *   nueva entra sola al test.
 * - Aplica con `prisma migrate deploy` (lo mismo que `npm run db:migrate` y el
 *   `migrador` del servidor) y revierte con `revertirUltimaMigracion`, lo mismo
 *   que `npm run db:migrate:down`.
 *
 * `_prisma_migrations` no es tabla propia (docs/convenciones-base.md): la crea
 * Prisma y queda, pero **vacía**, porque cada reversión borra su fila. Así la
 * cadena se puede volver a aplicar después, y el test lo comprueba.
 *
 * Necesita Docker corriendo (RUNBOOK, sección 1).
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  imagenPostgresDeArchivo,
  RUTA_COMPOSE,
} from "../../scripts/lib/imagen-postgres.ts";
import {
  BIN_PRISMA,
  CARPETA_MIGRACIONES,
  type EjecutarPsql,
  listarMigraciones,
  OPCIONES_PSQL,
  revertirUltimaMigracion,
  ultimaMigracionAplicada,
} from "../../scripts/lib/migraciones.ts";

/** La imagen de Postgres de `docker-compose.yml`, con su tag y su digest. */
function imagenDeCompose(): string {
  const imagen = imagenPostgresDeArchivo(RUTA_COMPOSE);
  expect(imagen, `${RUTA_COMPOSE} no tiene una imagen postgres:`).toBeDefined();
  return imagen ?? "";
}

let contenedor: StartedPostgreSqlContainer | undefined;

function base(): StartedPostgreSqlContainer {
  expect(contenedor, "el contenedor de Postgres no arrancó").toBeDefined();
  return contenedor as StartedPostgreSqlContainer;
}

/** `psql` adentro del contenedor, con las mismas opciones que el script. */
const psql: EjecutarPsql = async (sql) => {
  const c = base();
  await c.copyContentToContainer([{ content: sql, target: "/tmp/script.sql" }]);
  const resultado = await c.exec([
    "psql",
    ...OPCIONES_PSQL,
    "-U",
    c.getUsername(),
    "-d",
    c.getDatabase(),
    "-f",
    "/tmp/script.sql",
  ]);
  return {
    codigo: resultado.exitCode,
    salida: resultado.stdout,
    error: resultado.stderr,
  };
};

/** Filas de una consulta (una por línea), o el test falla con el error. */
async function consultar(sql: string): Promise<string[]> {
  const resultado = await psql(sql);
  expect(resultado.error, `psql falló con: ${sql}`).toBe("");
  expect(resultado.codigo).toBe(0);
  return resultado.salida.split("\n").filter((fila) => fila !== "");
}

/** La CLI de Prisma contra el contenedor (y no contra la `DATABASE_URL` de `.env`). */
function prisma(...argumentos: string[]): {
  codigo: number | null;
  salida: string;
} {
  const resultado = spawnSync(process.execPath, [BIN_PRISMA, ...argumentos], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: base().getConnectionUri() },
  });
  return {
    codigo: resultado.status,
    salida: `${resultado.stdout}\n${resultado.stderr}`,
  };
}

/** Tablas en cualquier esquema que no sea del sistema, menos el registro de Prisma. */
const SQL_TABLAS_PROPIAS = `
  select table_schema || '.' || table_name from information_schema.tables
  where table_schema not in ('pg_catalog', 'information_schema')
    and table_name <> '_prisma_migrations'
  order by 1;`;

const SQL_MIGRACIONES_APLICADAS = `
  select migration_name from _prisma_migrations
  where finished_at is not null and rolled_back_at is null
  order by started_at, migration_name;`;

describe("migraciones", () => {
  beforeAll(async () => {
    contenedor = await new PostgreSqlContainer(imagenDeCompose())
      .withTmpFs({ "/var/lib/postgresql/data": "rw" })
      .start();
  }, 180_000);

  afterAll(async () => {
    await contenedor?.stop();
  }, 60_000);

  test("aplica la cadena entera, coincide con schema.prisma y la revierte entera", async () => {
    const migraciones = listarMigraciones();
    expect(migraciones.length).toBeGreaterThan(0);
    const sinDown = migraciones.filter(
      (nombre) =>
        !existsSync(path.join(CARPETA_MIGRACIONES, nombre, "down.sql")),
    );
    expect(sinDown, "migraciones sin down.sql (P1)").toEqual([]);

    // Base recién creada: ni el registro de Prisma existe.
    expect(await ultimaMigracionAplicada(psql)).toEqual({
      ok: true,
      valor: null,
    });

    // Todas, en orden.
    const deploy = prisma("migrate", "deploy");
    expect(deploy.codigo, deploy.salida).toBe(0);
    expect(await consultar(SQL_MIGRACIONES_APLICADAS)).toEqual(migraciones);

    // El esquema resultante es el de schema.prisma: diff vacío.
    const contraEsquema = prisma(
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    );
    expect(contraEsquema.codigo, contraEsquema.salida).toBe(0);

    // Todos los down.sql, en orden inverso.
    for (const nombre of [...migraciones].reverse()) {
      expect(await revertirUltimaMigracion(psql)).toEqual({
        tipo: "revertida",
        nombre,
      });
    }

    // Vacía: sin tablas propias y, para Prisma, nada que no sea una base vacía
    // (tipos, secuencias o índices sueltos también contarían).
    expect(await consultar(SQL_TABLAS_PROPIAS)).toEqual([]);
    const contraVacia = prisma(
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-empty",
      "--exit-code",
    );
    expect(contraVacia.codigo, contraVacia.salida).toBe(0);

    // El registro de Prisma queda, vacío: nada más que revertir.
    expect(await consultar("select count(*) from _prisma_migrations;")).toEqual(
      ["0"],
    );
    expect(await revertirUltimaMigracion(psql)).toEqual({ tipo: "nada" });

    // Y la cadena se vuelve a aplicar entera, sin tocar nada a mano.
    const otraVez = prisma("migrate", "deploy");
    expect(otraVez.codigo, otraVez.salida).toBe(0);
    expect(await consultar(SQL_MIGRACIONES_APLICADAS)).toEqual(migraciones);
  }, 120_000);
});
