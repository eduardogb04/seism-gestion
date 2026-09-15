/**
 * La cadena de migraciones y su reversión (F0-09, P1). Lo comparten
 * `npm run db:migrate:down` (`scripts/db-migrate-down.ts`, contra la base de
 * compose) y el test que aplica y revierte la cadena entera
 * (`tests/casos-uso/migraciones.test.ts`, contra un Postgres efímero): los dos
 * revierten con **el mismo** SQL. Decisiones: docs/adr/0009-reversion-de-migraciones.md.
 *
 * Sin driver de Postgres: el SQL lo corre `psql`, que viene en la imagen de
 * Postgres. Quién lo invoca (`docker compose exec` o `exec` de
 * Testcontainers) lo decide cada lado con un `EjecutarPsql`.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/** Donde viven las migraciones (igual que en `prisma.config.ts`). */
export const CARPETA_MIGRACIONES = "prisma/migrations";

/**
 * La CLI de Prisma por ruta, como hace `node_modules/.bin/prisma` (el paquete
 * no la exporta): igual en Windows y en Linux, sin depender de un shell.
 */
export const BIN_PRISMA = path.join(
  process.cwd(),
  "node_modules",
  "prisma",
  "build",
  "index.js",
);

/**
 * Opciones con que se corre `psql`, las mismas en los dos lados: sin
 * `.psqlrc` (`-X`), sin mensajes de estado (`-q`), cortando en el primer error
 * (`ON_ERROR_STOP`) y con la salida pelada, una fila por línea (`-tA`).
 */
export const OPCIONES_PSQL = [
  "-X",
  "-q",
  "-v",
  "ON_ERROR_STOP=1",
  "-t",
  "-A",
] as const;

export interface ResultadoPsql {
  readonly codigo: number;
  readonly salida: string;
  readonly error: string;
}

/** Corre un script SQL con `psql` (y `OPCIONES_PSQL`) contra una base. */
export type EjecutarPsql = (sql: string) => Promise<ResultadoPsql>;

/**
 * `<marca de 14 dígitos>_<nombre>`, como las escribe `prisma migrate dev`. El
 * nombre va literal en el `delete` de la reversión: solo se acepta esta forma.
 */
const NOMBRE_MIGRACION = /^\d{14}_[a-z0-9_]+$/;

/**
 * Las migraciones de la carpeta, en el orden en que se aplican (el de la
 * marca de tiempo del nombre): cada subcarpeta con un `migration.sql`.
 */
export function listarMigraciones(carpeta = CARPETA_MIGRACIONES): string[] {
  return readdirSync(carpeta, { withFileTypes: true })
    .filter(
      (entrada) =>
        entrada.isDirectory() &&
        existsSync(path.join(carpeta, entrada.name, "migration.sql")),
    )
    .map((entrada) => entrada.name)
    .sort();
}

/**
 * Consulta de la última migración aplicada (la de nombre más alto entre las
 * terminadas y no marcadas como revertidas). Si `_prisma_migrations` no
 * existe todavía (base que nunca se migró), no devuelve nada en vez de fallar.
 */
const SQL_ULTIMA_APLICADA = [
  "select to_regclass('_prisma_migrations') is not null as hay_registro \\gset",
  "\\if :hay_registro",
  "select migration_name from _prisma_migrations",
  "  where finished_at is not null and rolled_back_at is null",
  "  order by migration_name desc limit 1;",
  "\\endif",
  "",
].join("\n");

/**
 * El SQL que revierte una migración: su `down.sql` **y** el borrado de su
 * fila en `_prisma_migrations` (si no, `prisma migrate deploy` la da por
 * aplicada y no la vuelve a correr), en **una sola transacción**: o queda
 * todo revertido, o no cambió nada. Por eso un `down.sql` no lleva `BEGIN` ni
 * `COMMIT` propios (docs/convenciones-base.md). `nombre` ya viene validado
 * contra `NOMBRE_MIGRACION`.
 */
function sqlDeReversion(nombre: string, downSql: string): string {
  return [
    "begin;",
    downSql,
    `delete from _prisma_migrations where migration_name = '${nombre}';`,
    "commit;",
    "",
  ].join("\n");
}

export type ResultadoConsulta<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly mensaje: string };

/** La última migración aplicada en la base, o `null` si no hay ninguna. */
export async function ultimaMigracionAplicada(
  psql: EjecutarPsql,
): Promise<ResultadoConsulta<string | null>> {
  const resultado = await psql(SQL_ULTIMA_APLICADA);
  if (resultado.codigo !== 0) {
    return {
      ok: false,
      mensaje: `no se pudo leer _prisma_migrations (psql salió ${resultado.codigo}).\n${resultado.error.trim()}`,
    };
  }
  const nombre = resultado.salida.trim();
  return { ok: true, valor: nombre === "" ? null : nombre };
}

export type ResultadoReversion =
  | { readonly tipo: "revertida"; readonly nombre: string }
  | { readonly tipo: "nada" }
  | { readonly tipo: "error"; readonly mensaje: string };

/**
 * Revierte la última migración aplicada: aplica su `down.sql` y borra su
 * fila de `_prisma_migrations`, en una transacción. `nada` si la base no
 * tiene migraciones aplicadas.
 */
export async function revertirUltimaMigracion(
  psql: EjecutarPsql,
  carpeta = CARPETA_MIGRACIONES,
): Promise<ResultadoReversion> {
  const ultima = await ultimaMigracionAplicada(psql);
  if (!ultima.ok) {
    return { tipo: "error", mensaje: ultima.mensaje };
  }
  const nombre = ultima.valor;
  if (nombre === null) {
    return { tipo: "nada" };
  }
  if (!NOMBRE_MIGRACION.test(nombre)) {
    return {
      tipo: "error",
      mensaje: `la última migración aplicada tiene un nombre inesperado (${nombre}): no se revierte.`,
    };
  }
  const rutaDown = path.join(carpeta, nombre, "down.sql");
  if (!existsSync(rutaDown)) {
    return {
      tipo: "error",
      mensaje: `la última migración aplicada es ${nombre}, pero no existe ${rutaDown}: sin down.sql no se revierte.`,
    };
  }

  const resultado = await psql(
    sqlDeReversion(nombre, readFileSync(rutaDown, "utf8")),
  );
  if (resultado.codigo !== 0) {
    return {
      tipo: "error",
      mensaje: `falló la reversión de ${nombre} (psql salió ${resultado.codigo}); la transacción no se confirmó, la base quedó como estaba.\n${resultado.error.trim()}`,
    };
  }
  return { tipo: "revertida", nombre };
}
