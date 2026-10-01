/**
 * El índice único de cada campo único de un ABM (F1-03, ADR 0031) se escribe a
 * mano en la migración: Prisma no declara índices sobre expresiones. Para que
 * no dependa de la memoria, este test recorre **todas las definiciones
 * registradas** y, por cada campo de `unicos`, exige en la base migrada un
 * índice único parcial sobre `lower(<columna>)` con `eliminado_en IS NULL`.
 *
 * La tabla y la columna salen de `prisma/schema.prisma`: el modelo se llama
 * como la entidad.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { DEFINICIONES } from "../../src/casos-uso/abm/definiciones.ts";
import { uriBaseCompartida } from "./_arnes/base.ts";

const ESQUEMA = readFileSync(
  path.resolve(import.meta.dirname, "../../prisma/schema.prisma"),
  "utf8",
);

/** La tabla de un modelo y la columna de un campo, como los nombra la base. */
function enLaBase(modelo: string, campo: string) {
  const cuerpo = new RegExp(
    `^model ${modelo} \\{\\r?\\n([\\s\\S]*?)^\\}`,
    "m",
  ).exec(ESQUEMA)?.[1];
  if (cuerpo === undefined) {
    throw new Error(`no hay un modelo ${modelo} en schema.prisma`);
  }
  const linea = new RegExp(`^\\s+${campo}\\s.*$`, "m").exec(cuerpo)?.[0];
  if (linea === undefined) {
    throw new Error(`el modelo ${modelo} no tiene el campo ${campo}`);
  }
  return {
    tabla: /@@map\("([^"]+)"\)/.exec(cuerpo)?.[1] ?? modelo,
    columna: /@map\("([^"]+)"\)/.exec(linea)?.[1] ?? campo,
  };
}

const UNICOS = Object.values(DEFINICIONES).flatMap(({ entidad, unicos }) =>
  unicos.map((campo) => [entidad, campo] as const),
);

let prisma: ReturnType<typeof crearClientePrisma> | undefined;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

describe("índices únicos de los ABM", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test("hay campos únicos que revisar, y el nombre de Grupos es uno", () => {
    expect(UNICOS).toContainEqual(["Grupo", "nombre"]);
  });

  test.each(UNICOS)(
    "%s.%s tiene su índice único parcial en la base",
    async (entidad, campo) => {
      const { tabla, columna } = enLaBase(entidad, campo);

      const indices = await cliente().$queryRaw<{ indexdef: string }[]>`
      select indexdef from pg_indexes where tablename = ${tabla}`;

      const esperado = new RegExp(
        `^CREATE UNIQUE INDEX .* \\(lower\\("?${columna}"?\\)\\) WHERE \\("?eliminado_en"? IS NULL\\)$`,
      );
      expect(
        indices
          .map(({ indexdef }) => indexdef)
          .filter((definicion) => esperado.test(definicion)),
        `falta en la migración: CREATE UNIQUE INDEX "${tabla}_${columna}_unico" ON "${tabla}" (lower("${columna}")) WHERE ("eliminado_en" IS NULL);`,
      ).toHaveLength(1);
    },
  );
});
