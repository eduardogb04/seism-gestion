/**
 * F3-03 · La migración de las modalidades de facturación, con datos como los de
 * la semilla vieja (R14): una base con todas las migraciones anteriores, un
 * servicio con una factura vigente, uno con solo una anulada y uno sin
 * facturas; la migración y su `down.sql`. Datos inventados. Necesita Docker
 * corriendo.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import {
  CARPETA_MIGRACIONES,
  listarMigraciones,
} from "../../scripts/lib/migraciones.ts";
import { crearBaseVacia, psqlEn } from "./_arnes/base.ts";

const BASE = "modalidades_de_facturacion";
const MIGRACION = "20261018110000_modalidades_de_facturacion";
const psql = psqlEn(BASE);

const CON_FACTURA = "00000000-0000-4000-8000-000000000001";
const CON_ANULADA = "00000000-0000-4000-8000-000000000002";
const SIN_FACTURAS = "00000000-0000-4000-8000-000000000003";

async function correr(sql: string): Promise<string[]> {
  const resultado = await psql(sql);
  expect(resultado.error).toBe("");
  expect(resultado.codigo).toBe(0);
  return resultado.salida.split("\n").filter((fila) => fila !== "");
}

function sqlDe(archivo: "migration.sql" | "down.sql") {
  return readFileSync(
    path.join(CARPETA_MIGRACIONES, MIGRACION, archivo),
    "utf8",
  );
}

const ACTOR = `'{"tipo":"sistema","proceso":"prueba-migracion"}'`;

const columnas = (tabla: string) =>
  correr(
    `select column_name from information_schema.columns
     where table_name = '${tabla}' order by column_name;`,
  );

describe("migración de las modalidades de facturación", () => {
  beforeAll(async () => {
    await crearBaseVacia(BASE);
    for (const nombre of listarMigraciones().filter(
      (nombre) => nombre < MIGRACION,
    )) {
      await correr(
        readFileSync(
          path.join(CARPETA_MIGRACIONES, nombre, "migration.sql"),
          "utf8",
        ),
      );
    }
    // Sin las claves foráneas de clientes, tipos y usuarios: acá solo importan servicios y facturas.
    await correr(`
      set session_replication_role = replica;
      insert into servicios (id, codigo, cliente_id, tipo_servicio_id, titulo, modalidad,
        responsable_id, fecha_pedido, creado_en, creado_por, actualizado_en, actualizado_por)
      select v.id::uuid, v.codigo, gen_random_uuid(), gen_random_uuid(), 'Servicio inventado',
        'puntual', gen_random_uuid(), date '2031-05-01', now(), ${ACTOR}, now(), ${ACTOR}
      from (values ('${CON_FACTURA}', 'SRV-2031-001'), ('${CON_ANULADA}', 'SRV-2031-002'),
        ('${SIN_FACTURAS}', 'SRV-2031-003')) as v(id, codigo);
      insert into facturas (servicio_id, numero, fecha, vencimiento, importe_centavos,
        importe_moneda, alicuota_iva, creado_en, creado_por, actualizado_en, actualizado_por,
        eliminado_en, eliminado_por)
      values
        ('${CON_FACTURA}', '0001-00000001', date '2031-06-01', date '2031-07-01', 100000, 'ARS',
          210, now(), ${ACTOR}, now(), ${ACTOR}, null, null),
        ('${CON_ANULADA}', '0001-00000002', date '2031-06-01', date '2031-07-01', 100000, 'ARS',
          210, now(), ${ACTOR}, now(), ${ACTOR}, now(), ${ACTOR});
    `);
  });

  test("deja «Por hitos» a los servicios con alguna factura (también anulada), al resto sin modalidad, y vuelve con su down.sql", async () => {
    const serviciosAntes = await columnas("servicios");
    const facturasAntes = await columnas("facturas");

    await correr(sqlDe("migration.sql"));
    expect(
      await correr(
        `select codigo || '|' || coalesce(modalidad_facturacion, '-') from servicios order by codigo;`,
      ),
    ).toEqual([
      "SRV-2031-001|por_hitos",
      "SRV-2031-002|por_hitos",
      "SRV-2031-003|-",
    ]);
    expect(
      await correr("select count(*) from facturas where periodo is not null;"),
    ).toEqual(["0"]);
    expect(await correr("select count(*) from servicios_cuotas;")).toEqual([
      "0",
    ]);

    await correr(sqlDe("down.sql"));
    expect(await columnas("servicios")).toEqual(serviciosAntes);
    expect(await columnas("facturas")).toEqual(facturasAntes);
    expect(
      await correr(
        "select count(*) from information_schema.tables where table_name = 'servicios_cuotas';",
      ),
    ).toEqual(["0"]);
    expect(await correr("select count(*) from facturas;")).toEqual(["2"]);
  });
});
