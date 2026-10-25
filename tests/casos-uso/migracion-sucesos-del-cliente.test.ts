/**
 * F4-05 · La migración de los sucesos del cliente, con sucesos previos: una base
 * con todas las migraciones anteriores, dos servicios de dos clientes con sus
 * sucesos (uno anulado); la migración y su `down.sql`. Datos inventados.
 * Necesita Docker corriendo.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import {
  CARPETA_MIGRACIONES,
  listarMigraciones,
} from "../../scripts/lib/migraciones.ts";
import { crearBaseVacia, psqlEn } from "./_arnes/base.ts";

const BASE = "sucesos_del_cliente";
const MIGRACION = "20261025110000_sucesos_del_cliente";
const psql = psqlEn(BASE);

const CLIENTE_UNO = "00000000-0000-4000-8000-0000000000a1";
const CLIENTE_DOS = "00000000-0000-4000-8000-0000000000a2";
const SERVICIO_UNO = "00000000-0000-4000-8000-000000000001";
const SERVICIO_DOS = "00000000-0000-4000-8000-000000000002";

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

const columnas = () =>
  correr(
    `select column_name || '|' || is_nullable from information_schema.columns
     where table_name = 'servicios_sucesos' order by column_name;`,
  );

describe("migración de los sucesos del cliente", () => {
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
    // Sin las claves foráneas de tipos y usuarios: acá solo importan clientes, servicios y sucesos.
    await correr(`
      set session_replication_role = replica;
      insert into clientes (id, razon_social, cuit, condicion_iva, domicilio, localidad, provincia,
        codigo_postal, es_cliente, es_proveedor, creado_en, creado_por, actualizado_en, actualizado_por)
      select v.id::uuid, v.nombre, v.cuit, 'responsable_inscripto', 'Calle Falsa 123',
        'Ciudad Ejemplo', 'cordoba', 'X5000', true, false, now(), ${ACTOR}, now(), ${ACTOR}
      from (values ('${CLIENTE_UNO}', 'Cliente Uno S.A.', '30000000015'),
        ('${CLIENTE_DOS}', 'Cliente Dos S.A.', '30000000023')) as v(id, nombre, cuit);
      insert into servicios (id, codigo, cliente_id, tipo_servicio_id, titulo, modalidad,
        responsable_id, fecha_pedido, creado_en, creado_por, actualizado_en, actualizado_por)
      select v.id::uuid, v.codigo, v.cliente::uuid, gen_random_uuid(), 'Servicio inventado',
        'puntual', gen_random_uuid(), date '2031-05-01', now(), ${ACTOR}, now(), ${ACTOR}
      from (values ('${SERVICIO_UNO}', 'SRV-2031-001', '${CLIENTE_UNO}'),
        ('${SERVICIO_DOS}', 'SRV-2031-002', '${CLIENTE_DOS}')) as v(id, codigo, cliente);
      insert into servicios_sucesos (servicio_id, fecha, texto, motivo_anulacion, creado_en,
        creado_por, actualizado_en, actualizado_por, eliminado_en, eliminado_por)
      values
        ('${SERVICIO_UNO}', date '2031-06-01', 'Uno vigente', null, now(), ${ACTOR}, now(), ${ACTOR}, null, null),
        ('${SERVICIO_UNO}', date '2031-06-02', 'Uno anulado', 'Error', now(), ${ACTOR}, now(), ${ACTOR}, now(), ${ACTOR}),
        ('${SERVICIO_DOS}', date '2031-06-03', 'Dos vigente', null, now(), ${ACTOR}, now(), ${ACTOR}, null, null);
    `);
  });

  test("cada suceso previo queda con el cliente de su servicio, ninguno se pierde, el servicio pasa a opcional y vuelve con su down.sql", async () => {
    const antes = await columnas();

    await correr(sqlDe("migration.sql"));
    expect(
      await correr(
        `select texto || '|' || cliente_id || '|' || servicio_id from servicios_sucesos order by texto;`,
      ),
    ).toEqual([
      `Dos vigente|${CLIENTE_DOS}|${SERVICIO_DOS}`,
      `Uno anulado|${CLIENTE_UNO}|${SERVICIO_UNO}`,
      `Uno vigente|${CLIENTE_UNO}|${SERVICIO_UNO}`,
    ]);
    expect(
      await correr(
        `select column_name || '|' || is_nullable from information_schema.columns
         where table_name = 'servicios_sucesos' and column_name in ('cliente_id', 'servicio_id')
         order by column_name;`,
      ),
    ).toEqual(["cliente_id|NO", "servicio_id|YES"]);

    // Una situación suelta (sin servicio) ya es posible…
    await correr(`
      insert into servicios_sucesos (cliente_id, fecha, texto, creado_en, creado_por,
        actualizado_en, actualizado_por)
      values ('${CLIENTE_UNO}', date '2031-06-04', 'Suelto', now(), ${ACTOR}, now(), ${ACTOR});
    `);
    // …y un cliente que no existe no vale.
    const rechazada = await psql(`
      set session_replication_role = origin;
      insert into servicios_sucesos (cliente_id, fecha, texto, creado_en, creado_por,
        actualizado_en, actualizado_por)
      values (gen_random_uuid(), date '2031-06-04', 'Sin cliente', now(), ${ACTOR}, now(), ${ACTOR});
    `);
    expect(rechazada.error).toContain("servicios_sucesos_cliente_id_fkey");

    await correr(sqlDe("down.sql"));
    expect(await columnas()).toEqual(antes);
    expect(await correr("select count(*) from servicios_sucesos;")).toEqual([
      "3",
    ]);
  });
});
