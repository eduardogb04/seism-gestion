/**
 * F3-01 · La migración del recorrido por etapas, con datos como los de la
 * semilla vieja (R11): una base con todas las migraciones anteriores, cuatro
 * servicios con su historial en los estados de antes (uno cerrado desde
 * «Vigente», que el recorrido nuevo ya no permite y se conserva igual), la migración y su
 * `down.sql`. Datos inventados. Necesita Docker corriendo.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import {
  CARPETA_MIGRACIONES,
  listarMigraciones,
} from "../../scripts/lib/migraciones.ts";
import { crearBaseVacia, psqlEn } from "./_arnes/base.ts";

const BASE = "recorrido_por_etapas";
const MIGRACION = "20261016100000_recorrido_por_etapas";
const psql = psqlEn(BASE);

const SOLICITADO = "00000000-0000-4000-8000-000000000001";
const VIGENTE = "00000000-0000-4000-8000-000000000002";
const PERDIDO = "00000000-0000-4000-8000-000000000003";
const CERRADO = "00000000-0000-4000-8000-000000000004";

/** Los historiales de antes: `[servicio, posicion, de, a]`. */
const ANTES = [
  [SOLICITADO, 0, "", "solicitado"],
  [VIGENTE, 0, "", "solicitado"],
  [VIGENTE, 1, "solicitado", "cotizado"],
  [VIGENTE, 2, "cotizado", "adjudicado"],
  [VIGENTE, 3, "adjudicado", "vigente"],
  [PERDIDO, 0, "", "solicitado"],
  [PERDIDO, 1, "solicitado", "cotizado"],
  [PERDIDO, 2, "cotizado", "adjudicado"],
  [PERDIDO, 3, "adjudicado", "perdido"],
  [CERRADO, 0, "", "solicitado"],
  [CERRADO, 1, "solicitado", "cotizado"],
  [CERRADO, 2, "cotizado", "adjudicado"],
  [CERRADO, 3, "adjudicado", "vigente"],
  [CERRADO, 4, "vigente", "cerrado"],
] as const;

const DESPUES = [
  [SOLICITADO, 0, "", "creado"],
  [VIGENTE, 0, "", "creado"],
  [VIGENTE, 1, "creado", "cotizado"],
  [VIGENTE, 2, "cotizado", "adjudicado"],
  [VIGENTE, 3, "adjudicado", "en_ejecucion"],
  [PERDIDO, 0, "", "creado"],
  [PERDIDO, 1, "creado", "cotizado"],
  [PERDIDO, 2, "cotizado", "adjudicado"],
  [PERDIDO, 3, "adjudicado", "perdido"],
  [CERRADO, 0, "", "creado"],
  [CERRADO, 1, "creado", "cotizado"],
  [CERRADO, 2, "cotizado", "adjudicado"],
  [CERRADO, 3, "adjudicado", "en_ejecucion"],
  [CERRADO, 4, "en_ejecucion", "cerrado"],
] as const;

async function correr(sql: string): Promise<string[]> {
  const resultado = await psql(sql);
  expect(resultado.error).toBe("");
  expect(resultado.codigo).toBe(0);
  return resultado.salida.split("\n").filter((fila) => fila !== "");
}

function sqlDe(migracion: string, archivo: "migration.sql" | "down.sql") {
  return readFileSync(
    path.join(CARPETA_MIGRACIONES, migracion, archivo),
    "utf8",
  );
}

async function eventos(): Promise<string[]> {
  return correr(
    `select servicio_id || '|' || posicion || '|' || coalesce(de, '') || '|' || a
     from servicios_eventos order by servicio_id, posicion;`,
  );
}

const comoFilas = (
  tabla: readonly (readonly [string, number, string, string])[],
) => tabla.map((fila) => fila.join("|"));

const ACTOR = `'{"tipo":"sistema","proceso":"prueba-migracion"}'`;

describe("migración del recorrido por etapas", () => {
  beforeAll(async () => {
    await crearBaseVacia(BASE);
    const anteriores = listarMigraciones().filter(
      (nombre) => nombre < MIGRACION,
    );
    for (const nombre of anteriores) {
      await correr(sqlDe(nombre, "migration.sql"));
    }
    // Sin las claves foráneas de clientes, tipos y usuarios: acá solo importa el historial.
    await correr(`
      set session_replication_role = replica;
      insert into servicios (id, codigo, cliente_id, tipo_servicio_id, titulo, modalidad,
        responsable_id, fecha_pedido, creado_en, creado_por, actualizado_en, actualizado_por)
      select v.id::uuid, v.codigo, gen_random_uuid(), gen_random_uuid(), 'Servicio inventado',
        'puntual', gen_random_uuid(), date '2031-05-01', now(), ${ACTOR}, now(), ${ACTOR}
      from (values ('${SOLICITADO}', 'SRV-2031-001'), ('${VIGENTE}', 'SRV-2031-002'),
        ('${PERDIDO}', 'SRV-2031-003'), ('${CERRADO}', 'SRV-2031-004')) as v(id, codigo);
      insert into servicios_eventos (servicio_id, posicion, de, a, en, actor)
      values ${ANTES.map(
        ([servicio, posicion, de, a]) =>
          `('${servicio}', ${posicion}, ${de === "" ? "null" : `'${de}'`}, '${a}', now(), ${ACTOR})`,
      ).join(", ")};
    `);
  });

  test("renombra solicitado y vigente en las dos columnas, conserva cada evento y vuelve con su down.sql", async () => {
    expect(await eventos()).toEqual(comoFilas(ANTES));

    await correr(sqlDe(MIGRACION, "migration.sql"));
    expect(await eventos()).toEqual(comoFilas(DESPUES));
    expect(await correr("select count(*) from servicios_sucesos;")).toEqual([
      "0",
    ]);

    await correr(sqlDe(MIGRACION, "down.sql"));
    expect(await eventos()).toEqual(comoFilas(ANTES));
    expect(
      await correr(
        "select count(*) from information_schema.tables where table_name = 'servicios_sucesos';",
      ),
    ).toEqual(["0"]);
  });

  test("al revertir, «Finalizado», que antes no existía, vuelve a «Vigente» (pérdida aceptada en el ADR 0039)", async () => {
    await correr(sqlDe(MIGRACION, "migration.sql"));
    await correr(
      `insert into servicios_eventos (servicio_id, posicion, de, a, en, actor)
       values ('${VIGENTE}', 4, 'en_ejecucion', 'finalizado', now(), ${ACTOR});`,
    );

    await correr(sqlDe(MIGRACION, "down.sql"));
    expect(await eventos()).toEqual(
      comoFilas([
        ...ANTES.slice(0, 5),
        [VIGENTE, 4, "vigente", "vigente"],
        ...ANTES.slice(5),
      ]),
    );
  });
});
