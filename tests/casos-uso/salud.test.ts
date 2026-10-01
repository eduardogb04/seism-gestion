/**
 * `listarSalud()` (F0-25, F0-26), contra la base real: cada job con su última
 * corrida y su color, los fallidos pendientes con código y edad, cada
 * integración con su última prueba exitosa y el gasto de IA del mes. Nunca
 * lanza: si una sonda, la base o el gasto no responden, lo dice en el
 * resultado.
 *
 * El color de un job lo decide el caso de uso, con el reloj inyectado
 * (`RelojFijo`): rojo si nunca corrió, si su última corrida terminó en error,
 * si no se pudo leer o si su última corrida empezó hace más del doble de su
 * intervalo, aunque haya sido `ok`.
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
import { crearLectorConfiguracion } from "../../src/adaptadores/prisma/configuracion.ts";
import { crearRegistroCorridasPrisma } from "../../src/adaptadores/prisma/corridas-worker.ts";
import { crearSondaBase } from "../../src/adaptadores/prisma/sonda-base.ts";
import { crearRepositorioUsoIa } from "../../src/adaptadores/prisma/uso-ia.ts";
import { fechaHoraLocalDe } from "../../src/adaptadores/reloj/sistema.ts";
import { gastoDelMes } from "../../src/casos-uso/ia/gasto-del-mes.ts";
import {
  type DependenciasSalud,
  LIMITE_FALLIDOS,
  listarSalud,
  memoriaDePruebasVacia,
} from "../../src/casos-uso/salud/listar-salud.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../src/dominio/compartido/errores/error-sistema.ts";
import { RelojFijo } from "../../src/dominio/compartido/reloj.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

type Db = ReturnType<typeof crearClientePrisma>;

let prisma: Db | undefined;

function cliente(): Db {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as Db;
}

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
/** Cada cuánto corre el `latido` de mentira de estos tests. */
const INTERVALO = 5 * MINUTO;
/** "Ahora" de estos tests: una fecha inventada, con reloj fijo. */
const AHORA = new Date("2026-03-10T12:00:00.000Z");

function haceMs(ms: number): Date {
  return new Date(AHORA.getTime() - ms);
}

function dependencias(
  db: Db,
  cambios: Partial<DependenciasSalud> = {},
): DependenciasSalud {
  return {
    reloj: RelojFijo(fechaHoraLocalDe(AHORA)),
    aFechaHora: fechaHoraLocalDe,
    jobs: [
      { nombre: "latido", intervaloMs: INTERVALO },
      { nombre: "nunca-corrio", intervaloMs: INTERVALO },
    ],
    corridas: crearRegistroCorridasPrisma(db),
    fallidos: crearColaFallidosPrisma(db),
    sondas: [crearSondaBase(db)],
    pruebasExitosas: memoriaDePruebasVacia(),
    gastoIa: () =>
      gastoDelMes(RelojFijo(fechaHoraLocalDe(AHORA)), {
        usos: crearRepositorioUsoIa(db),
        configuracion: crearLectorConfiguracion(db),
      }),
    ...cambios,
  };
}

async function corrida(
  db: Db,
  inicio: Date,
  resultado: "ok" | "error" | null,
  job = "latido",
): Promise<void> {
  await db.corridaWorker.create({
    data: {
      job,
      inicio,
      fin: resultado === null ? null : new Date(inicio.getTime() + 1000),
      resultado,
      detalle: resultado === "error" ? "INF-0001 · de prueba" : null,
    },
  });
}

async function estadoDe(db: Db, job = "latido") {
  const salud = await listarSalud(dependencias(db));
  const estado = salud.jobs.find((j) => j.job === job);
  expect(estado, `no hay estado del job ${job}`).toBeDefined();
  return estado as NonNullable<typeof estado>;
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

  describe("jobs", () => {
    test("la última corrida de cada job, hace cuánto y en verde; el que nunca corrió, en rojo", async () => {
      const db = cliente();
      await corrida(db, haceMs(20 * MINUTO), "error");
      await corrida(db, haceMs(3 * MINUTO), "ok");

      const salud = await listarSalud(dependencias(db));

      expect(salud.jobs).toEqual([
        {
          job: "latido",
          estado: "ok",
          ultimaCorrida: {
            inicio: haceMs(3 * MINUTO),
            fin: new Date(haceMs(3 * MINUTO).getTime() + 1000),
            resultado: "ok",
            detalle: null,
            haceMs: 3 * MINUTO,
          },
        },
        {
          job: "nunca-corrio",
          estado: "rojo",
          motivo: "nunca corrió",
          ultimaCorrida: null,
        },
      ]);
    });

    test("una última corrida en error es roja aunque sea reciente", async () => {
      const db = cliente();
      await corrida(db, haceMs(MINUTO), "error");

      const estado = await estadoDe(db);

      expect(estado.estado).toBe("rojo");
      expect(estado.motivo).toBe("la última corrida terminó en error");
      expect(estado.ultimaCorrida?.detalle).toBe("INF-0001 · de prueba");
    });

    test("justo el doble del intervalo sigue en verde", async () => {
      const db = cliente();
      await corrida(db, haceMs(2 * INTERVALO), "ok");

      expect((await estadoDe(db)).estado).toBe("ok");
    });

    test("un milisegundo más que el doble del intervalo es rojo, aunque la última haya sido ok", async () => {
      const db = cliente();
      await corrida(db, haceMs(2 * INTERVALO + 1), "ok");

      const estado = await estadoDe(db);

      expect(estado.estado).toBe("rojo");
      expect(estado.motivo).toBe("no corrió en el doble de su intervalo");
      expect(estado.ultimaCorrida?.resultado).toBe("ok");
    });

    test("un worker caído tres días: la última fue ok y aparece en rojo", async () => {
      const db = cliente();
      await corrida(db, haceMs(3 * DIA), "ok");

      const estado = await estadoDe(db);

      expect(estado.estado).toBe("rojo");
      expect(estado.ultimaCorrida?.haceMs).toBe(3 * DIA);
    });

    test("una corrida sin fin: en curso si es reciente, roja si pasó el doble del intervalo", async () => {
      const db = cliente();
      await corrida(db, haceMs(INTERVALO), null);
      expect((await estadoDe(db)).estado).toBe("ok");

      await limpiarBase();
      await corrida(db, haceMs(2 * INTERVALO + 1), null);
      expect((await estadoDe(db)).estado).toBe("rojo");
    });

    test("cada job se mide contra su propio intervalo", async () => {
      const db = cliente();
      await corrida(db, haceMs(HORA), "ok", "diario");
      const salud = await listarSalud(
        dependencias(db, {
          jobs: [{ nombre: "diario", intervaloMs: DIA }],
        }),
      );

      expect(salud.jobs.map((j) => [j.job, j.estado])).toEqual([
        ["diario", "ok"],
      ]);
    });
  });

  describe("fallidos", () => {
    test("la lista trae origen, código y edad del más viejo al más nuevo; un resuelto no aparece; nunca la carga", async () => {
      const db = cliente();
      const cola = crearColaFallidosPrisma(db);
      for (const origen of ["prueba.a", "prueba.b", "prueba.c"]) {
        await cola.encolar({
          origen,
          codigoError: "INF-0002",
          carga: { dato: "inventado" },
          intentos: 3,
        });
      }
      await db.fallido.updateMany({
        where: { origen: "prueba.b" },
        data: { resueltoEn: AHORA, creadoEn: haceMs(2 * HORA) },
      });
      await db.fallido.updateMany({
        where: { origen: "prueba.a" },
        data: { creadoEn: haceMs(3 * DIA) },
      });
      await db.fallido.updateMany({
        where: { origen: "prueba.c" },
        data: { creadoEn: haceMs(5 * MINUTO) },
      });

      const salud = await listarSalud(dependencias(db));

      expect(salud.fallidosPendientes).toBe(2);
      expect(salud.fallidos).toEqual([
        {
          id: expect.any(String),
          origen: "prueba.a",
          codigoError: "INF-0002",
          haceMs: 3 * DIA,
        },
        {
          id: expect.any(String),
          origen: "prueba.c",
          codigoError: "INF-0002",
          haceMs: 5 * MINUTO,
        },
      ]);
      expect(JSON.stringify(salud)).not.toContain("inventado");
    });

    test(`muestra hasta ${LIMITE_FALLIDOS} y el total sigue siendo el real`, async () => {
      const db = cliente();
      await db.fallido.createMany({
        data: Array.from({ length: LIMITE_FALLIDOS + 5 }, (_, i) => ({
          origen: `prueba.${i}`,
          codigoError: "INF-0002",
          carga: {},
          intentos: 3,
        })),
      });

      const salud = await listarSalud(dependencias(db));

      expect(salud.fallidosPendientes).toBe(LIMITE_FALLIDOS + 5);
      expect(salud.fallidos).toHaveLength(LIMITE_FALLIDOS);
    });
  });

  describe("integraciones", () => {
    test("la base responde: ok, con el instante de la prueba exitosa", async () => {
      const db = cliente();
      const salud = await listarSalud(dependencias(db));

      expect(salud.integraciones).toEqual([
        {
          nombre: "base",
          estado: "ok",
          ultimaPruebaOk: {
            en: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
            haceMs: 0,
          },
        },
      ]);
    });

    test("ok y después error: muestra el instante del ok anterior, no el del error", async () => {
      const db = cliente();
      let responde = true;
      const primera = dependencias(db, {
        sondas: [
          {
            nombre: "almacen",
            probar: () =>
              responde ? Promise.resolve() : Promise.reject(new Error("caída")),
          },
        ],
      });
      const alPrincipio = await listarSalud(primera);

      responde = false;
      const despues = await listarSalud({
        ...primera,
        reloj: RelojFijo(fechaHoraLocalDe(new Date(AHORA.getTime() + HORA))),
      });

      expect(despues.integraciones).toEqual([
        {
          nombre: "almacen",
          estado: "error",
          detalle: expect.stringMatching(/^INF-0001 · /),
          ultimaPruebaOk: {
            en: alPrincipio.integraciones[0]?.ultimaPruebaOk?.en,
            haceMs: HORA,
          },
        },
      ]);
    });

    test("una sonda que nunca respondió bien no tiene última prueba exitosa", async () => {
      const db = cliente();
      const salud = await listarSalud(
        dependencias(db, {
          sondas: [
            { nombre: "almacen", probar: () => Promise.reject(new Error("x")) },
          ],
        }),
      );

      expect(salud.integraciones).toEqual([
        {
          nombre: "almacen",
          estado: "error",
          detalle: expect.stringMatching(/^INF-0001 · /),
          ultimaPruebaOk: null,
        },
      ]);
    });
  });

  describe("gasto de IA", () => {
    async function conTope(db: Db, tope: string) {
      await db.configuracion.create({
        data: { clave: "ia.tope_mensual_usd", valor: tope },
      });
    }

    async function gastar(db: Db, costoUsd: string) {
      await db.usoIa.create({
        data: {
          en: haceMs(HORA),
          perfil: "prueba",
          modelo: "modelo-de-mentira",
          versionPrompt: "v0",
          costoUsd,
          tokens: 10,
          propuesta: {},
          propuestaValida: true,
        },
      });
    }

    test("el mes, lo gastado y el tope, en verde por debajo del tope", async () => {
      const db = cliente();
      await conTope(db, "10.00");
      await gastar(db, "9.999999");

      const { gastoIa } = await listarSalud(dependencias(db));

      expect(gastoIa).toEqual({
        tipo: "gasto",
        estado: "ok",
        mes: "2026-03",
        gastadoUsd: "9.999999",
        topeUsd: "10.00",
      });
    });

    test("gastado igual al tope es rojo", async () => {
      const db = cliente();
      await conTope(db, "10.00");
      await gastar(db, "10.000000");

      const { gastoIa } = await listarSalud(dependencias(db));

      expect(gastoIa).toMatchObject({ tipo: "gasto", estado: "rojo" });
    });

    test("si gastoDelMes lanza (falta el tope), dice el código y el resto del panel se ve igual", async () => {
      const db = cliente();

      const salud = await listarSalud(dependencias(db));

      expect(salud.gastoIa).toEqual({
        tipo: "error",
        detalle: expect.stringMatching(/^[A-Z]{2,3}-\d{4} · /),
      });
      expect(salud.jobs).toHaveLength(2);
      expect(salud.integraciones[0]?.estado).toBe("ok");
    });

    test("un error del catálogo se dice con su código y su descripción", async () => {
      const db = cliente();

      const salud = await listarSalud(
        dependencias(db, {
          gastoIa: () =>
            Promise.reject(nuevoError(catalogo.INF_0001, { motivo: "prueba" })),
        }),
      );

      expect(salud.gastoIa).toEqual({
        tipo: "error",
        detalle: `INF-0001 · ${catalogo.INF_0001.descripcion}`,
      });
    });
  });

  test("con la base caída no lanza: la base en error y lo que no se pudo leer, sin inventar", async () => {
    // Un puerto donde no escucha nadie: la conexión se rechaza enseguida.
    const caida = crearClientePrisma(
      "postgresql://prueba:prueba@127.0.0.1:1/prueba",
    );
    try {
      const salud = await listarSalud(dependencias(caida));

      expect(salud.integraciones).toEqual([
        {
          nombre: "base",
          estado: "error",
          detalle: expect.stringMatching(/^INF-0001 · /),
          ultimaPruebaOk: null,
        },
      ]);
      expect(salud.fallidosPendientes).toBeNull();
      expect(salud.fallidos).toBeNull();
      expect(salud.jobs.map((j) => j.job)).toEqual(["latido", "nunca-corrio"]);
      for (const job of salud.jobs) {
        expect(job.estado).toBe("rojo");
        expect(job.motivo).toBe("no se pudo leer la última corrida");
        expect(job.ultimaCorrida).toBeNull();
        expect(job.error).toMatch(/^INF-0001 · /);
      }
      expect(salud.gastoIa.tipo).toBe("error");
    } finally {
      await caida.$disconnect();
    }
  });
});
