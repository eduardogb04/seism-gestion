/**
 * Los jobs del panel de salud (F0-26, R3 y R4): el intervalo de cada job sale
 * de su expresión cron (la diferencia entre dos ejecuciones consecutivas) y
 * la lista sale de `JOBS` de `src/worker/jobs.ts`, la misma definición que
 * usa el worker: no hay nombres ni crons escritos a mano en otro lado.
 * Nivel dominio: nada sale a la red ni toca la base.
 */

import { describe, expect, test } from "vitest";
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
