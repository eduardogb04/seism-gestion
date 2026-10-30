/**
 * F6-03 · La migración de las notas y la factura adicional (ADR 0050): las
 * reglas que la base hace cumplir y el `down.sql`, que se niega mientras haya
 * notas o adicionales y revierte exacto cuando no hay. Datos inventados.
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

const BASE = "notas_y_adicional";
const MIGRACION = "20261029120000_notas_y_adicional";
const psql = psqlEn(BASE);

const SERVICIO = "00000000-0000-4000-8000-000000000001";
const FACTURA = "00000000-0000-4000-8000-000000000002";
const ACTOR = `'{"tipo":"sistema","proceso":"prueba-migracion"}'`;

async function correr(sql: string): Promise<string[]> {
  const resultado = await psql(sql);
  expect(resultado.error).toBe("");
  expect(resultado.codigo).toBe(0);
  return resultado.salida.split("\n").filter((fila) => fila !== "");
}

const sqlDe = (archivo: "migration.sql" | "down.sql") =>
  readFileSync(path.join(CARPETA_MIGRACIONES, MIGRACION, archivo), "utf8");

const columnasDeFacturas = () =>
  correr(
    `select column_name from information_schema.columns
     where table_name = 'facturas' order by column_name;`,
  );

/** Un comprobante del servicio de prueba; `extra` son columnas y valores de F6-03. */
const comprobante = (numero: string, extra: Record<string, string> = {}) => `
  insert into facturas (servicio_id, numero, fecha, vencimiento, importe_centavos, importe_moneda,
    alicuota_iva, creado_en, creado_por, actualizado_en, actualizado_por
    ${Object.keys(extra)
      .map((columna) => `, ${columna}`)
      .join("")})
  values ('${SERVICIO}', '${numero}', date '2031-07-01', date '2031-08-01', 10000, 'ARS', 210,
    now(), ${ACTOR}, now(), ${ACTOR} ${Object.values(extra)
      .map((valor) => `, ${valor}`)
      .join("")});`;

describe("migración de las notas y la factura adicional", () => {
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
    // Sin las claves foráneas del servicio: acá solo importan las facturas.
    await correr(`
      set session_replication_role = replica;
      insert into servicios (id, codigo, cliente_id, tipo_servicio_id, titulo, modalidad,
        responsable_id, fecha_pedido, creado_en, creado_por, actualizado_en, actualizado_por)
      values ('${SERVICIO}', 'SRV-2031-001', gen_random_uuid(), gen_random_uuid(), 'Servicio inventado',
        'puntual', gen_random_uuid(), date '2031-05-01', now(), ${ACTOR}, now(), ${ACTOR});
      ${comprobante("0001-00000001", { id: `'${FACTURA}'` })}
    `);
  });

  test("las facturas que había quedan como facturas; la base rechaza un tipo desconocido, una nota de débito adicional y una nota de crédito sin comprobante; el down.sql se niega mientras haya notas y revierte exacto sin ellas", async () => {
    const antes = await columnasDeFacturas();
    await correr(sqlDe("migration.sql"));
    expect(
      await correr("select tipo || '|' || adicional from facturas;"),
    ).toEqual(["factura|false"]);

    for (const [numero, extra] of [
      ["X-1", { tipo: "'remito'" }],
      ["X-2", { tipo: "'nota_debito'", adicional: "true" }],
      ["X-3", { tipo: "'nota_credito'" }],
    ] as const) {
      const rechazado = await psql(comprobante(numero, extra));
      expect(rechazado.codigo, numero).not.toBe(0);
      expect(rechazado.error, numero).toContain("violates check constraint");
    }
    // El mismo número en otro tipo es otra numeración.
    await correr(
      comprobante("0001-00000001", {
        tipo: "'nota_credito'",
        comprobante_asociado_id: `'${FACTURA}'`,
      }),
    );

    const negado = await psql(sqlDe("down.sql"));
    expect(negado.codigo).not.toBe(0);
    expect(negado.error).toContain(
      "hay notas de crédito, de débito o facturas adicionales",
    );
    expect(await columnasDeFacturas()).not.toEqual(antes);

    await correr("delete from facturas where tipo <> 'factura';");
    await correr(sqlDe("down.sql"));
    expect(await columnasDeFacturas()).toEqual(antes);
    expect(await correr("select count(*) from facturas;")).toEqual(["1"]);
  });
});
