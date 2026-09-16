/**
 * Test del mecanismo de semilla (F0-10, cimiento 3): `sembrar` corrida dos
 * veces contra un Postgres de verdad deja la base exactamente igual.
 *
 * Corre contra la base compartida del arnés de casos de uso (F0-14), que el
 * `globalSetup` deja migrada una vez por corrida; `limpiarBase()` la vacía
 * antes de cada test. Usa el cliente real (`crearClientePrisma`, con el
 * adaptador `@prisma/adapter-pg`) para correr `sembrar` dos veces y comparar
 * las filas de `configuracion` entre las dos corridas: tienen que coincidir
 * fila por fila, `id` y `creado_en` incluidos (si `sembrar` recreara o tocara
 * una fila sin necesidad, esos campos —o `actualizado_en`— cambiarían entre
 * corridas).
 *
 * Necesita Docker corriendo (RUNBOOK, sección 1).
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { sembrar } from "../../prisma/seed.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

let prisma: ReturnType<typeof crearClientePrisma> | undefined;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

describe("semilla", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

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
