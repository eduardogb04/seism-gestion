/**
 * `ColaFallidos.listarPendientes(limite)` (F0-26, R5), contra Postgres real:
 * lo que muestra el panel de salud de los fallidos sin resolver. Solo
 * `id`, `origen`, `codigoError` y `creadoEn`: nunca la `carga`, que queda en la
 * base.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearColaFallidosPrisma } from "../../src/adaptadores/prisma/cola-fallidos.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

type Db = ReturnType<typeof crearClientePrisma>;

let prisma: Db | undefined;

function db(): Db {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as Db;
}

async function fallido(origen: string, creadoEn: string, resuelto = false) {
  await db().fallido.create({
    data: {
      origen,
      codigoError: "INF-0002",
      carga: { dato: "inventado" },
      intentos: 3,
      creadoEn: new Date(creadoEn),
      resueltoEn: resuelto ? new Date("2026-03-09T00:00:00Z") : null,
    },
  });
}

describe("ColaFallidos.listarPendientes", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test("del más viejo al más nuevo, sin los resueltos y sin la carga", async () => {
    await fallido("prueba.nuevo", "2026-03-08T10:00:00Z");
    await fallido("prueba.resuelto", "2026-03-05T10:00:00Z", true);
    await fallido("prueba.viejo", "2026-03-01T10:00:00Z");
    await fallido("prueba.medio", "2026-03-04T10:00:00Z");

    const pendientes = await crearColaFallidosPrisma(db()).listarPendientes(10);

    expect(pendientes).toEqual([
      {
        id: expect.any(String),
        origen: "prueba.viejo",
        codigoError: "INF-0002",
        creadoEn: new Date("2026-03-01T10:00:00Z"),
      },
      {
        id: expect.any(String),
        origen: "prueba.medio",
        codigoError: "INF-0002",
        creadoEn: new Date("2026-03-04T10:00:00Z"),
      },
      {
        id: expect.any(String),
        origen: "prueba.nuevo",
        codigoError: "INF-0002",
        creadoEn: new Date("2026-03-08T10:00:00Z"),
      },
    ]);
  });

  test("trae hasta el límite, los más viejos primero", async () => {
    await fallido("prueba.c", "2026-03-03T10:00:00Z");
    await fallido("prueba.a", "2026-03-01T10:00:00Z");
    await fallido("prueba.b", "2026-03-02T10:00:00Z");

    const pendientes = await crearColaFallidosPrisma(db()).listarPendientes(2);

    expect(pendientes.map((p) => p.origen)).toEqual(["prueba.a", "prueba.b"]);
  });

  test("dos fallidos con el mismo origen, código y fecha vuelven con `id` distinto (M-07)", async () => {
    await fallido("prueba.igual", "2026-03-01T10:00:00Z");
    await fallido("prueba.igual", "2026-03-01T10:00:00Z");

    const pendientes = await crearColaFallidosPrisma(db()).listarPendientes(10);

    expect(pendientes).toHaveLength(2);
    expect(new Set(pendientes.map((p) => p.id)).size).toBe(2);
  });

  test("sin pendientes, una lista vacía", async () => {
    await fallido("prueba.resuelto", "2026-03-05T10:00:00Z", true);

    expect(await crearColaFallidosPrisma(db()).listarPendientes(50)).toEqual(
      [],
    );
  });
});
