/**
 * El panel de salud tal como lo arma la app (F0-26, R4 y R6): `armarSalud`
 * (`src/infraestructura/arranque/salud.ts`) contra la base real. Los jobs del
 * panel salen de `JOBS` (`src/worker/jobs.ts`), la misma definición que
 * levanta el worker, con su intervalo calculado desde su cron; y la memoria de
 * la última prueba exitosa de cada integración vive con el panel armado, no
 * en cada pedido.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { fechaHoraLocalDe } from "../../src/adaptadores/reloj/sistema.ts";
import { RelojFijo } from "../../src/dominio/compartido/reloj.ts";
import { armarSalud } from "../../src/infraestructura/arranque/salud.ts";
import { JOBS } from "../../src/worker/jobs.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

/**
 * El worker de esta tanda tiene un job más que el real, para probar que el
 * panel lee la lista de `JOBS` y no una escrita a mano.
 */
vi.mock("../../src/worker/jobs.ts", async (importarOriginal) => {
  const original =
    await importarOriginal<typeof import("../../src/worker/jobs.ts")>();
  return {
    ...original,
    JOBS: [
      ...original.JOBS,
      {
        nombre: "diario-de-prueba",
        cron: "0 3 * * *",
        ejecutar: () => Promise.resolve(),
      },
    ],
  };
});

type Db = ReturnType<typeof crearClientePrisma>;

const MINUTO = 60_000;
/** "Ahora" de estos tests: una fecha inventada, con reloj fijo. */
const AHORA = new Date("2026-03-10T12:00:00.000Z");

let prisma: Db | undefined;

function cliente(): Db {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as Db;
}

async function corrida(job: string, haceMs: number): Promise<void> {
  const inicio = new Date(AHORA.getTime() - haceMs);
  await cliente().corridaWorker.create({
    data: {
      job,
      inicio,
      fin: new Date(inicio.getTime() + 1000),
      resultado: "ok",
    },
  });
}

describe("armarSalud", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  function panel() {
    return armarSalud(cliente(), RelojFijo(fechaHoraLocalDe(AHORA)));
  }

  test("muestra exactamente los jobs del worker, hayan corrido o no", async () => {
    const salud = await panel()();

    expect(salud.jobs.map((job) => job.job)).toEqual(
      JOBS.map((job) => job.nombre),
    );
    expect(salud.jobs.every((job) => job.estado === "rojo")).toBe(true);
  });

  test("un job que el worker suma aparece solo, medido contra su propio intervalo", async () => {
    await corrida("diario-de-prueba", 2 * 24 * 60 * MINUTO);

    const salud = await panel()();

    expect(
      salud.jobs.find((job) => job.job === "diario-de-prueba")?.estado,
    ).toBe("ok");
  });

  test("el latido corre cada 5 minutos: a 10 minutos justos está en verde", async () => {
    await corrida("latido", 10 * MINUTO);

    const salud = await panel()();

    expect(salud.jobs.find((job) => job.job === "latido")?.estado).toBe("ok");
  });

  test("y a 10 minutos y un milisegundo, en rojo aunque haya sido ok", async () => {
    await corrida("latido", 10 * MINUTO + 1);

    const salud = await panel()();

    expect(salud.jobs.find((job) => job.job === "latido")?.estado).toBe("rojo");
  });

  test("la base está en verde, con el gasto de IA del mes de la configuración sembrada", async () => {
    await cliente().configuracion.create({
      data: { clave: "ia.tope_mensual_usd", valor: "10.00" },
    });

    const salud = await panel()();

    expect(salud.integraciones).toMatchObject([
      { nombre: "base", estado: "ok" },
    ]);
    expect(salud.gastoIa).toMatchObject({
      tipo: "gasto",
      estado: "ok",
      mes: "2026-03",
      topeUsd: "10.00",
    });
  });

  test("la última prueba exitosa se recuerda entre pedidos: el panel se arma una vez", async () => {
    let cae = false;
    const base = cliente();
    const inestable = new Proxy(base, {
      get(objetivo, propiedad) {
        if (propiedad === "$queryRaw" && cae) {
          return () => Promise.reject(new Error("la base no responde"));
        }
        return Reflect.get(objetivo, propiedad);
      },
    });
    const consultar = armarSalud(inestable, RelojFijo(fechaHoraLocalDe(AHORA)));

    const bien = await consultar();
    cae = true;
    const mal = await consultar();

    expect(bien.integraciones[0]).toMatchObject({ estado: "ok" });
    expect(mal.integraciones[0]).toMatchObject({ estado: "error" });
    expect(mal.integraciones[0]?.ultimaPruebaOk).toEqual(
      bien.integraciones[0]?.ultimaPruebaOk,
    );
    expect(mal.integraciones[0]?.ultimaPruebaOk).not.toBeNull();
  });
});
