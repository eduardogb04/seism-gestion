/**
 * `listarSalud()` (F0-25), contra la base real: última corrida de cada job,
 * fallidos pendientes y el estado de cada integración conocida (por ahora,
 * `base`, con un `SELECT 1`). Nunca lanza: si una sonda o la base no
 * responden, lo dice en el resultado.
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
import { crearRegistroCorridasPrisma } from "../../src/adaptadores/prisma/corridas-worker.ts";
import { crearSondaBase } from "../../src/adaptadores/prisma/sonda-base.ts";
import { listarSalud } from "../../src/casos-uso/salud/listar-salud.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

let prisma: ReturnType<typeof crearClientePrisma> | undefined;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function dependenciasReales(db: ReturnType<typeof crearClientePrisma>) {
  return {
    jobs: ["latido", "nunca-corrio"],
    corridas: crearRegistroCorridasPrisma(db),
    fallidos: crearColaFallidosPrisma(db),
    sondas: [crearSondaBase(db)],
  };
}

describe("listarSalud", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test("última corrida de cada job, fallidos pendientes y la base ok", async () => {
    const db = cliente();
    await db.corridaWorker.createMany({
      data: [
        {
          job: "latido",
          inicio: new Date("2026-01-01T10:00:00Z"),
          fin: new Date("2026-01-01T10:00:01Z"),
          resultado: "ok",
        },
        {
          job: "latido",
          inicio: new Date("2026-01-01T10:05:00Z"),
          fin: new Date("2026-01-01T10:05:01Z"),
          resultado: "error",
          detalle: "INF-0001 · de prueba",
        },
      ],
    });
    const cola = crearColaFallidosPrisma(db);
    await cola.encolar({
      origen: "prueba.a",
      codigoError: "INF-0001",
      carga: {},
      intentos: 3,
    });
    await cola.encolar({
      origen: "prueba.b",
      codigoError: "INF-0001",
      carga: {},
      intentos: 3,
    });
    await db.fallido.updateMany({
      where: { origen: "prueba.b" },
      data: { resueltoEn: new Date() },
    });

    const salud = await listarSalud(dependenciasReales(db));

    expect(salud).toEqual({
      jobs: [
        {
          job: "latido",
          ultimaCorrida: {
            inicio: new Date("2026-01-01T10:05:00Z"),
            fin: new Date("2026-01-01T10:05:01Z"),
            resultado: "error",
            detalle: "INF-0001 · de prueba",
          },
        },
        { job: "nunca-corrio", ultimaCorrida: null },
      ],
      fallidosPendientes: 1,
      integraciones: [{ nombre: "base", estado: "ok" }],
    });
  });

  test("una sonda que lanza queda en error, sin que listarSalud lance", async () => {
    const db = cliente();
    const salud = await listarSalud({
      ...dependenciasReales(db),
      sondas: [
        crearSondaBase(db),
        {
          nombre: "almacen",
          probar: () => Promise.reject(new Error("sin respuesta")),
        },
      ],
    });

    expect(salud.integraciones).toEqual([
      { nombre: "base", estado: "ok" },
      {
        nombre: "almacen",
        estado: "error",
        detalle: expect.stringMatching(/^INF-0001 · /),
      },
    ]);
  });

  test("con la base caída no lanza: la base en error y lo que no se pudo leer, sin inventar", async () => {
    // Un puerto donde no escucha nadie: la conexión se rechaza enseguida.
    const caida = crearClientePrisma(
      "postgresql://prueba:prueba@127.0.0.1:1/prueba",
    );
    try {
      const salud = await listarSalud(dependenciasReales(caida));

      expect(salud.integraciones).toEqual([
        {
          nombre: "base",
          estado: "error",
          detalle: expect.stringMatching(/^INF-0001 · /),
        },
      ]);
      expect(salud.fallidosPendientes).toBeNull();
      expect(salud.jobs.map((j) => j.job)).toEqual(["latido", "nunca-corrio"]);
      for (const job of salud.jobs) {
        expect(job.ultimaCorrida).toBeNull();
        expect(job.error).toMatch(/^INF-0001 · /);
      }
    } finally {
      await caida.$disconnect();
    }
  });
});
