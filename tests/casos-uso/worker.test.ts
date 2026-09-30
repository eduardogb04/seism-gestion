/**
 * El worker (F0-25, ADR 0025), contra la base real:
 *
 * - `registrarCorrida` deja una fila por corrida en `corridas_worker`:
 *   `inicio` antes de correr el job, `fin` y `resultado` después, siempre.
 * - El planificador (`croner`) sigue vivo si un job lanza: la corrida
 *   siguiente también queda registrada. No se esperan 5 minutos: el job de
 *   prueba recibe su expresión cron por parámetro (cada segundo).
 * - `latido` corre cada 5 minutos y no hace nada más que registrarse.
 * - El proceso (`node src/worker/index.ts`, sin compilador) valida su entorno
 *   con el esquema de la app: sin `DATABASE_URL` no arranca; con él, arranca.
 */

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearRegistroCorridasPrisma } from "../../src/adaptadores/prisma/corridas-worker.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../src/dominio/compartido/errores/error-sistema.ts";
import { crearLog } from "../../src/infraestructura/log.ts";
import { JOBS, latido } from "../../src/worker/jobs.ts";
import { iniciarPlanificador } from "../../src/worker/planificador.ts";
import { crearRegistrarCorrida } from "../../src/worker/registrar-corrida.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

const ENTRADA_WORKER = path.join(
  import.meta.dirname,
  "..",
  "..",
  "src",
  "worker",
  "index.ts",
);

let prisma: ReturnType<typeof crearClientePrisma> | undefined;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function logEnMemoria() {
  const lineas: string[] = [];
  const log = crearLog({
    formato: "json",
    nivel: "debug",
    destino: { write: (linea) => lineas.push(linea) },
  });
  const registros = () =>
    lineas.map((linea) => JSON.parse(linea) as Record<string, unknown>);
  return { log, registros };
}

function registrarCorridaReal() {
  return crearRegistrarCorrida({
    corridas: crearRegistroCorridasPrisma(cliente()),
    ahora: () => new Date(),
  });
}

/** Espera (de a 100 ms, hasta `limite` ms) a que `condicion` sea verdadera. */
async function esperarHasta(
  condicion: () => Promise<boolean>,
  limite: number,
): Promise<boolean> {
  const tope = Date.now() + limite;
  while (Date.now() < tope) {
    if (await condicion()) {
      return true;
    }
    await new Promise((resolver) => setTimeout(resolver, 100));
  }
  return condicion();
}

describe("worker", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test("latido corre cada 5 minutos y es un job del worker", () => {
    expect(latido.nombre).toBe("latido");
    expect(latido.cron).toBe("*/5 * * * *");
    expect(JOBS).toContain(latido);
  });

  test("una corrida que sale bien: inicio antes, fin después, resultado ok", async () => {
    const db = cliente();
    const registrar = registrarCorridaReal();
    let filasDuranteElJob = -1;

    await registrar("prueba-ok", async () => {
      // `inicio` ya está en la base mientras el job corre; `fin` todavía no.
      const fila = await db.corridaWorker.findFirst({
        where: { job: "prueba-ok" },
      });
      filasDuranteElJob = fila === null ? 0 : 1;
      expect(fila?.fin).toBeNull();
      expect(fila?.resultado).toBeNull();
    });

    expect(filasDuranteElJob).toBe(1);
    const [fila] = await db.corridaWorker.findMany();
    expect(fila).toMatchObject({
      job: "prueba-ok",
      resultado: "ok",
      detalle: null,
    });
    expect(fila?.fin).not.toBeNull();
    expect(fila?.fin?.getTime()).toBeGreaterThanOrEqual(
      fila?.inicio.getTime() ?? Number.POSITIVE_INFINITY,
    );
  });

  test("un job que lanza: resultado error, fin no nulo, detalle con código y redactado, y el error sigue", async () => {
    const db = cliente();
    const registrar = registrarCorridaReal();

    await expect(
      registrar("prueba-error", () =>
        Promise.reject(new Error("falló avisando a persona@ejemplo.test")),
      ),
    ).rejects.toThrow("falló");

    const [fila] = await db.corridaWorker.findMany();
    expect(fila?.resultado).toBe("error");
    expect(fila?.fin).not.toBeNull();
    expect(fila?.detalle).toMatch(/^INF-0001 · /);
    expect(fila?.detalle).toContain("[redactado]");
    expect(fila?.detalle).not.toContain("persona@ejemplo.test");
  });

  test("un ErrorSistema deja su propio código en el detalle", async () => {
    const db = cliente();
    await expect(
      registrarCorridaReal()("prueba-codigo", () =>
        Promise.reject(nuevoError(catalogo.ALM_0001, {})),
      ),
    ).rejects.toMatchObject({ codigo: "ALM-0001" });

    const [fila] = await db.corridaWorker.findMany();
    expect(fila?.detalle).toMatch(/^ALM-0001 · /);
  });

  test("el planificador sigue vivo después de un job que lanza: la corrida siguiente también se registra", async () => {
    const db = cliente();
    const { log, registros } = logEnMemoria();
    const planificador = iniciarPlanificador(
      [
        {
          nombre: "prueba-lanza",
          cron: "* * * * * *",
          ejecutar: () => Promise.reject(new Error("siempre falla")),
        },
      ],
      { registrarCorrida: registrarCorridaReal(), log },
    );

    try {
      const dos = await esperarHasta(
        async () =>
          (await db.corridaWorker.count({
            where: { job: "prueba-lanza", fin: { not: null } },
          })) >= 2,
        6000,
      );
      expect(dos, "no se registraron dos corridas terminadas").toBe(true);
    } finally {
      planificador.detener();
    }

    const filas = await db.corridaWorker.findMany({
      where: { job: "prueba-lanza", fin: { not: null } },
    });
    expect(filas.every((f) => f.resultado === "error")).toBe(true);
    // Cada falla se loguea con código: no se la traga.
    const errores = registros().filter(
      (r) => r.level === "error" && r.job === "prueba-lanza",
    );
    expect(errores.length).toBeGreaterThanOrEqual(2);
    expect(errores.every((r) => r.codigo === "INF-0001")).toBe(true);
  });

  test("latido, por el planificador, solo se registra: resultado ok y nada más", async () => {
    const db = cliente();
    // El mismo job, con la expresión cambiada a cada segundo para no esperar 5 minutos.
    const planificador = iniciarPlanificador(
      [{ ...latido, cron: "* * * * * *" }],
      {
        registrarCorrida: registrarCorridaReal(),
        log: logEnMemoria().log,
      },
    );
    try {
      const corrio = await esperarHasta(
        async () =>
          (await db.corridaWorker.count({ where: { fin: { not: null } } })) >=
          1,
        6000,
      );
      expect(corrio, "latido no se registró").toBe(true);
    } finally {
      planificador.detener();
    }

    const filas = await db.corridaWorker.findMany({
      where: { fin: { not: null } },
    });
    expect(filas.length).toBeGreaterThanOrEqual(1);
    expect(filas[0]).toMatchObject({
      job: "latido",
      resultado: "ok",
      detalle: null,
    });
  });

  test("sin DATABASE_URL el worker no arranca: sale distinto de 0 y dice cuál falta", () => {
    const { DATABASE_URL: _sinBase, ...resto } = process.env;
    const hijo = spawnSync(process.execPath, [ENTRADA_WORKER], {
      encoding: "utf8",
      timeout: 20_000,
      env: { ...resto, APP_ENTORNO: "ci" },
    });

    expect(hijo.error).toBeUndefined();
    expect(hijo.status).not.toBe(0);
    expect(hijo.status).not.toBeNull();
    expect(hijo.stderr).toContain("DATABASE_URL");
    expect(hijo.stderr).toContain("el worker no arranca");
  });

  test("con el entorno válido, `node src/worker/index.ts` arranca y anuncia sus jobs", async () => {
    const hijo = spawn(process.execPath, [ENTRADA_WORKER], {
      env: {
        ...process.env,
        APP_ENTORNO: "ci",
        DATABASE_URL: uriBaseCompartida(),
        // Obligatoria desde F0-30 (inventada, dominio reservado `.test`).
        ADMIN_INICIAL_EMAIL: "admin@ejemplo.test",
        // Obligatoria desde F0-31.
        IDENTIDAD: "falsa",
        // Obligatoria desde F0-27.
        ALMACEN: "disco",
        ALMACEN_DIRECTORIO: ".almacen",
        LOG_NIVEL: "info",
      },
    });
    let salida = "";
    hijo.stdout.on("data", (trozo: Buffer) => {
      salida += trozo.toString("utf8");
    });
    hijo.stderr.on("data", (trozo: Buffer) => {
      salida += trozo.toString("utf8");
    });

    try {
      const arranco = await esperarHasta(
        () => Promise.resolve(salida.includes("worker arrancado")),
        20_000,
      );
      expect(arranco, `el worker no arrancó: ${salida}`).toBe(true);
      expect(hijo.exitCode).toBeNull();
      const linea = salida
        .split("\n")
        .find((l) => l.includes("worker arrancado"));
      expect(JSON.parse(linea ?? "{}")).toMatchObject({
        level: "info",
        jobs: [{ nombre: "latido", cron: "*/5 * * * *" }],
      });
    } finally {
      hijo.kill();
    }
  });
});
