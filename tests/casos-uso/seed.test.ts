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
 * Desde F1-03 también siembra los **datos de demostración** (tres grupos
 * inventados), con el actor `db-seed` y su auditoría, en `local` y en `ci`;
 * en `servidor` no.
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
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

let prisma: ReturnType<typeof crearClientePrisma> | undefined;

/** Desde F0-30 la semilla también pide el administrador inicial (inventado) y el reloj. */
function opciones(appEntorno: "local" | "ci" | "servidor" = "local") {
  const fecha = crearFechaHora({
    anio: 2031,
    mes: 1,
    dia: 2,
    hora: 3,
    minuto: 4,
    segundo: 5,
    milisegundo: 6,
  });
  if (!fecha.ok) {
    throw new Error(fecha.mensaje);
  }
  return {
    adminInicialEmail: "admin@ejemplo.test",
    appEntorno,
    reloj: RelojFijo(fecha.fechaHora),
  };
}

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

    await sembrar(db, opciones());
    expect(Date.now() - inicio).toBeLessThan(120_000);

    const primeraVez = await db.configuracion.findMany({
      orderBy: { clave: "asc" },
    });
    // Valores inventados (F0-28, R6): el tope del mes y el costo estimado
    // por defecto de una llamada a la IA, en dólares con punto decimal.
    expect(primeraVez.map((fila) => [fila.clave, fila.valor])).toEqual([
      ["ia.costo_estimado_usd.defecto", "0.01"],
      ["ia.tope_mensual_usd", "10.00"],
    ]);

    await sembrar(db, opciones());
    const segundaVez = await db.configuracion.findMany({
      orderBy: { clave: "asc" },
    });

    expect(segundaVez).toEqual(primeraVez);
  }, 120_000);

  test("siembra tres grupos de demostración con su auditoría, una sola vez", async () => {
    const db = cliente();
    const foto = async () => ({
      grupos: await db.grupo.findMany({ orderBy: { nombre: "asc" } }),
      auditoria: await db.auditoria.findMany({
        where: { entidad: "Grupo" },
        orderBy: { id: "asc" },
      }),
    });

    await sembrar(db, opciones());
    const primeraVez = await foto();
    await sembrar(db, opciones());

    expect(primeraVez.grupos.map(({ nombre }) => nombre)).toEqual([
      "Grupo Centro",
      "Grupo Norte",
      "Grupo Sur",
    ]);
    const semilla = { tipo: "sistema", proceso: "db-seed" };
    for (const grupo of primeraVez.grupos) {
      expect(grupo).toMatchObject({ creadoPor: semilla, eliminadoEn: null });
    }
    expect(primeraVez.auditoria).toHaveLength(3);
    for (const registro of primeraVez.auditoria) {
      expect(registro).toMatchObject({ accion: "crear", actor: semilla });
    }
    expect(await foto()).toEqual(primeraVez);
  });

  test("un grupo de demostración dado de baja no vuelve a aparecer al sembrar otra vez", async () => {
    const db = cliente();
    await sembrar(db, opciones());
    await db.grupo.updateMany({
      where: { nombre: "Grupo Norte" },
      data: { eliminadoEn: new Date(), eliminadoPor: { tipo: "sistema" } },
    });

    await sembrar(db, opciones());

    expect(await db.grupo.count()).toBe(3);
  });

  test("siembra cinco sitios de demostración, uno solo con coordenadas, y no los repite ni repone uno dado de baja", async () => {
    const db = cliente();

    await sembrar(db, opciones());
    await db.sitio.updateMany({
      where: { nombre: "Depósito Ejemplo" },
      data: { eliminadoEn: new Date(), eliminadoPor: { tipo: "sistema" } },
    });
    await sembrar(db, opciones());

    expect(await db.sitio.count()).toBe(5);
    expect(await db.sitio.count({ where: { latitud: { not: null } } })).toBe(1);
    expect(await db.auditoria.count({ where: { entidad: "Sitio" } })).toBe(5);
  });

  test("siembra cuatro camiones de demostración (dos semis, un chasis y un otro), no los repite ni repone uno dado de baja, y no en el servidor", async () => {
    const db = cliente();
    const tipos = async () =>
      (await db.camion.findMany({ select: { tipo: true } }))
        .map(({ tipo }) => tipo)
        .sort();

    await sembrar(db, opciones("servidor"));
    expect(await db.camion.count()).toBe(0);

    await sembrar(db, opciones());
    await db.camion.updateMany({
      where: { patenteTractor: "ZZ001ZZ" },
      data: { eliminadoEn: new Date(), eliminadoPor: { tipo: "sistema" } },
    });
    await sembrar(db, opciones());

    expect(await tipos()).toEqual([
      "chasis",
      "otro",
      "semi_con_cisterna",
      "semi_con_cisterna",
    ]);
    expect(await db.auditoria.count({ where: { entidad: "Camion" } })).toBe(4);
  });

  test("siembra los cinco tipos de servicio activos, uno solo recurrente, una sola vez y no en el servidor", async () => {
    const db = cliente();
    const tipos = () =>
      db.tipoServicio.findMany({
        orderBy: { nombre: "asc" },
        select: { nombre: true, modalidad: true, activo: true },
      });

    await sembrar(db, opciones("servidor"));
    expect(await tipos()).toEqual([]);

    await sembrar(db, opciones());
    await sembrar(db, opciones());

    expect(await tipos()).toEqual([
      { nombre: "Auditoría de tanques", modalidad: "puntual", activo: true },
      {
        nombre: "Certificación de camiones",
        modalidad: "puntual",
        activo: true,
      },
      { nombre: "Informes", modalidad: "puntual", activo: true },
      { nombre: "Logística", modalidad: "puntual", activo: true },
      {
        nombre: "Servicio de operación / alquiler de tanques",
        modalidad: "recurrente",
        activo: true,
      },
    ]);
  });

  test("siembra seis egresos, en pesos y en dólares y de dos meses, una sola vez y no en el servidor", async () => {
    const db = cliente();
    const egresos = () =>
      db.egreso.findMany({
        orderBy: [{ fecha: "asc" }, { concepto: "asc" }],
        select: { fecha: true, importeMoneda: true, proveedorId: true },
      });

    await sembrar(db, opciones("servidor"));
    expect(await egresos()).toEqual([]);

    await sembrar(db, opciones());
    await sembrar(db, opciones());

    const sembrados = await egresos();
    expect(sembrados).toHaveLength(6);
    expect(
      new Set(sembrados.map(({ importeMoneda }) => importeMoneda)),
    ).toEqual(new Set(["ARS", "USD"]));
    expect(
      new Set(sembrados.map(({ fecha }) => fecha.toISOString().slice(0, 7))),
    ).toEqual(new Set(["2026-09", "2026-10"]));
    expect(sembrados.some(({ proveedorId }) => proveedorId !== null)).toBe(
      true,
    );
    expect(await db.auditoria.count({ where: { entidad: "Egreso" } })).toBe(6);
  });

  test("en el servidor no siembra ningún grupo; en ci, sí", async () => {
    const db = cliente();

    await sembrar(db, opciones("servidor"));

    expect(await db.grupo.count()).toBe(0);
    expect(await db.sitio.count()).toBe(0);
    expect(await db.configuracion.count()).toBeGreaterThan(0);

    await sembrar(db, opciones("ci"));

    expect(await db.grupo.count()).toBe(3);
  });
});
