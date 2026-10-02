/**
 * El índice único de cada campo único de un ABM (F1-03, ADR 0031) se escribe a
 * mano en la migración: Prisma no declara índices sobre expresiones. Para que
 * no dependa de la memoria, este test recorre **todas las definiciones
 * registradas** y, por cada campo de `unicos`, exige en la base migrada un
 * índice único parcial sobre `lower(<columna>)` con `eliminado_en IS NULL`.
 * Un grupo de columnas (F1-05) lleva un solo índice con todas, en su orden; una
 * relación (que guarda un id) va sin `lower`. Una columna que admite `null`
 * (F1-06) suma `AND <columna> IS NOT NULL`: el vacío no cuenta como repetido.
 *
 * La tabla y la columna salen de `prisma/schema.prisma`: el modelo se llama
 * como la entidad.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { DEFINICIONES } from "../../src/casos-uso/abm/definiciones.ts";
import type { EntidadAbm } from "../../src/puertos/repositorios/abm.ts";
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
    admiteNull: new RegExp(`^\\s+${campo}\\s+\\w+\\?`).test(linea),
  };
}

const UNICOS = Object.values(DEFINICIONES).flatMap(({ entidad, unicos }) =>
  unicos.map(
    (unico) =>
      [entidad, typeof unico === "string" ? [unico] : unico.columnas] as const,
  ),
);

function esRelacion(entidad: EntidadAbm, campo: string): boolean {
  return (
    Object.entries(DEFINICIONES[entidad].campos).find(
      ([nombre]) => nombre === campo,
    )?.[1].tipo === "relacion"
  );
}

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
    expect(UNICOS).toContainEqual(["Grupo", ["nombre"]]);
  });

  test("el grupo de Sitios (cliente y nombre) es uno de los que se revisan", () => {
    expect(UNICOS).toContainEqual(["Sitio", ["clienteId", "nombre"]]);
  });

  test.each(UNICOS)(
    "%s %j tiene su índice único parcial en la base",
    async (entidad, campos) => {
      const columnas = campos.map((campo) => ({
        ...enLaBase(entidad, campo),
        relacion: esRelacion(entidad, campo),
      }));
      const tabla = columnas[0]?.tabla ?? entidad;
      const esperadas = columnas.map(({ columna, relacion }) =>
        relacion ? columna : `lower(${columna})`,
      );

      const noNulas = columnas
        .filter(({ admiteNull }) => admiteNull)
        .map(({ columna }) => `(${columna} IS NOT NULL)`);
      const donde =
        noNulas.length === 0
          ? "(eliminado_en IS NULL)"
          : `((eliminado_en IS NULL) AND ${noNulas.join(" AND ")})`;

      const indices = await cliente().$queryRaw<{ indexdef: string }[]>`
      select indexdef from pg_indexes where tablename = ${tabla}`;

      const escapar = (texto: string) =>
        texto.replaceAll("(", "\\(").replaceAll(")", "\\)");
      const esperado = new RegExp(
        `^CREATE UNIQUE INDEX .* \\(${escapar(esperadas.join(", "))}\\) WHERE ${escapar(donde)}$`,
      );
      expect(
        indices
          .map(({ indexdef }) => indexdef.replaceAll('"', ""))
          .filter((definicion) => esperado.test(definicion)),
        `falta en la migración: CREATE UNIQUE INDEX en "${tabla}" sobre (${esperadas.join(", ")}) WHERE ${donde}, con las columnas con sus nombres de la base`,
      ).toHaveLength(1);
    },
  );
});
