/**
 * El arnés del nivel **casos de uso** (F0-14), segunda mitad: lo que usan los
 * tests del contenedor único que levantó `contenedor.ts`.
 *
 * - `uriBaseCompartida()`: la base ya migrada que comparten los tests.
 * - `limpiarBase()`: la deja vacía con un `TRUNCATE` de todas las tablas de la
 *   aplicación. Es lo que va en un `beforeEach`: **base limpia por test**, sin
 *   levantar un contenedor nuevo (que es lo caro).
 * - `crearBaseVacia(nombre)`: una base recién creada, sin migrar, adentro del
 *   **mismo** contenedor. La usa el test de migraciones (F0-09), que necesita
 *   partir de cero y termina dejándola vacía otra vez.
 * - `psqlEn(base)`: un `EjecutarPsql` (el de `scripts/lib/migraciones.ts`) que
 *   corre `psql` adentro del contenedor. Los tests no tienen el objeto del
 *   contenedor —lo creó otro proceso— así que se llega por el cliente de
 *   Testcontainers con el id que dejó `provide`.
 */

import { getContainerRuntimeClient } from "testcontainers";
import { inject } from "vitest";
import type { EjecutarPsql } from "../../../scripts/lib/migraciones.ts";
import { OPCIONES_PSQL } from "../../../scripts/lib/migraciones.ts";
import { BASE_COMPARTIDA, type DatosPostgres } from "./contenedor.ts";

/** Marca de fin del SQL que se le pasa a `psql` por la entrada estándar. */
const FIN_DEL_SQL = "FIN_DEL_SQL_DEL_ARNES";

/**
 * `TRUNCATE` de todas las tablas de la aplicación, en un solo enunciado (así
 * las claves foráneas no obligan a ordenarlas). No nombra ninguna tabla: las
 * busca en el catálogo, así una tabla nueva entra sola. `_prisma_migrations`
 * no es tabla de la aplicación (docs/convenciones-base.md): no se toca, o la
 * base dejaría de estar migrada.
 */
const SQL_LIMPIAR = `
do $$
declare
  tablas text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ')
    into tablas
    from pg_tables
   where schemaname not in ('pg_catalog', 'information_schema')
     and tablename <> '_prisma_migrations';
  if tablas is not null then
    execute 'truncate table ' || tablas || ' restart identity cascade';
  end if;
end
$$;`;

/** Los datos del contenedor que levantó el `globalSetup`. */
export function datosPostgres(): DatosPostgres {
  return inject("postgres");
}

/** La URI de conexión de una base adentro del contenedor. */
export function uriDe(base: string): string {
  const { usuario, clave, host, puerto } = datosPostgres();
  return `postgresql://${usuario}:${clave}@${host}:${puerto}/${base}`;
}

/** La base compartida, ya migrada (`BASE_COMPARTIDA`). */
export function uriBaseCompartida(): string {
  return uriDe(BASE_COMPARTIDA);
}

/** `psql` adentro del contenedor, contra la base que se le pida. */
export function psqlEn(base: string): EjecutarPsql {
  return async (sql) => {
    const { id, usuario } = datosPostgres();
    const cliente = await getContainerRuntimeClient();
    const contenedor = cliente.container.getById(id);
    // El SQL entra por la entrada estándar (un *here-document* con la marca
    // entre comillas: el shell no le toca nada), así funcionan también los
    // metacomandos de psql (`\gset`, `\if`) que usa scripts/lib/migraciones.ts
    // y que `psql -c` no acepta.
    const guion = [
      `psql ${OPCIONES_PSQL.join(" ")} -U ${usuario} -d ${base} <<'${FIN_DEL_SQL}'`,
      sql,
      FIN_DEL_SQL,
      "",
    ].join("\n");
    const resultado = await cliente.container.exec(contenedor, [
      "sh",
      "-c",
      guion,
    ]);
    return {
      codigo: resultado.exitCode,
      salida: resultado.stdout,
      error: resultado.stderr,
    };
  };
}

/** Deja la base compartida sin una fila: es el `beforeEach` de este nivel. */
export async function limpiarBase(base = BASE_COMPARTIDA): Promise<void> {
  const resultado = await psqlEn(base)(SQL_LIMPIAR);
  if (resultado.codigo !== 0) {
    throw new Error(
      `el arnés no pudo limpiar ${base} (psql salió ${resultado.codigo}):\n${resultado.error}`,
    );
  }
}

/**
 * Crea una base nueva y vacía adentro del mismo contenedor y devuelve su URI.
 * Para los tests que necesitan una base sin migrar (F0-09).
 */
export async function crearBaseVacia(nombre: string): Promise<string> {
  const resultado = await psqlEn(BASE_COMPARTIDA)(
    `drop database if exists ${nombre};\ncreate database ${nombre};\n`,
  );
  if (resultado.codigo !== 0) {
    throw new Error(
      `el arnés no pudo crear la base ${nombre} (psql salió ${resultado.codigo}):\n${resultado.error}`,
    );
  }
  return uriDe(nombre);
}
