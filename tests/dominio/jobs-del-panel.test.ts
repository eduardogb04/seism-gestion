/**
 * Los jobs del panel de salud (F0-26, R3 y R4): el intervalo de cada job sale
 * de su expresión cron (el mayor intervalo entre sus próximas ejecuciones, M-07) y
 * la lista sale de `JOBS` de `src/worker/jobs.ts`, la misma definición que
 * usa el worker: no hay nombres ni crons escritos a mano en otro lado.
 * Nivel dominio: nada sale a la red ni toca la base.
 */

import { describe, expect, test } from "vitest";
import { fechaHoraLocalDe } from "../../src/adaptadores/reloj/sistema.ts";
import {
  listarSalud,
  memoriaDePruebasVacia,
} from "../../src/casos-uso/salud/listar-salud.ts";
import { RelojFijo } from "../../src/dominio/compartido/reloj.ts";
import { intervaloDeCron } from "../../src/infraestructura/arranque/intervalo-cron.ts";
import { jobsDelPanel } from "../../src/infraestructura/arranque/salud.ts";
import { JOBS } from "../../src/worker/jobs.ts";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

describe("intervaloDeCron", () => {
  test.each([
    ["* * * * * *", 1_000],
    ["*/5 * * * *", 5 * MINUTO],
    ["*/15 * * * *", 15 * MINUTO],
    ["0 * * * *", HORA],
    ["0 3 * * *", DIA],
    ["0 9 * * 1", 7 * DIA],
  ])("%s corre cada %i ms", (cron, esperado) => {
    expect(intervaloDeCron(cron)).toBe(esperado);
  });

  test("una expresión inválida no se acepta en silencio", () => {
    expect(() => intervaloDeCron("esto no es un cron")).toThrow();
  });

  describe("expresiones de intervalo irregular (M-07)", () => {
    test.each([
      ["0 9 * * 1-5", 3 * DIA],
      ["0 9 * * 1,4", 4 * DIA],
      ["0 9,17 * * *", 16 * HORA],
    ])(
      "%s usa el mayor intervalo entre sus próximas ejecuciones: %i ms",
      (cron, esperado) => {
        expect(intervaloDeCron(cron)).toBe(esperado);
      },
    );
  });

  test("un job de lunes a viernes no se ve rojo el lunes a las 9:30 si corrió el viernes a las 9:00", async () => {
    // 2026-03-09 es lunes; 2026-03-06, viernes.
    const lunes930 = new Date("2026-03-09T09:30:00.000Z");
    const viernes900 = new Date("2026-03-06T09:00:00.000Z");
    const salud = await listarSalud({
      reloj: RelojFijo(fechaHoraLocalDe(lunes930)),
      aFechaHora: fechaHoraLocalDe,
      jobs: [
        { nombre: "habiles", intervaloMs: intervaloDeCron("0 9 * * 1-5") },
      ],
      corridas: {
        iniciar: () => Promise.resolve("c1"),
        terminar: () => Promise.resolve(),
        ultimaCorrida: () =>
          Promise.resolve({
            job: "habiles",
            inicio: viernes900,
            fin: new Date(viernes900.getTime() + 1_000),
            resultado: "ok" as const,
            detalle: null,
          }),
      },
      fallidos: {
        encolar: () => Promise.resolve(),
        contarPendientes: () => Promise.resolve(0),
        listarPendientes: () => Promise.resolve([]),
      },
      sondas: [],
      pruebasExitosas: memoriaDePruebasVacia(),
      gastoIa: () =>
        Promise.resolve({
          mes: "2026-03",
          gastadoMicroUsd: 0n,
          topeMicroUsd: 1n,
          gastadoUsd: "0",
          topeUsd: "1",
        }),
    });

    expect(salud.jobs[0]?.estado).toBe("ok");
  });
});

describe("jobsDelPanel", () => {
  test("lista los jobs del worker, uno por uno, con su intervalo", () => {
    const panel = jobsDelPanel(JOBS);

    expect(panel.map((job) => job.nombre)).toEqual(
      JOBS.map((job) => job.nombre),
    );
    expect(panel.map((job) => job.intervaloMs)).toEqual(
      JOBS.map((job) => intervaloDeCron(job.cron)),
    );
  });

  test("un job nuevo aparece solo: nombre y cron de la definición", () => {
    const panel = jobsDelPanel([
      ...JOBS,
      {
        nombre: "diario-de-prueba",
        cron: "0 3 * * *",
        ejecutar: () => Promise.resolve(),
      },
    ]);

    expect(panel.at(-1)).toEqual({
      nombre: "diario-de-prueba",
      intervaloMs: DIA,
    });
  });

  test("el latido corre cada 5 minutos", () => {
    expect(jobsDelPanel(JOBS)).toContainEqual({
      nombre: "latido",
      intervaloMs: 5 * MINUTO,
    });
  });
});
