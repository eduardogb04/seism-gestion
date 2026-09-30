/**
 * `conReintento` y la cola de fallidos (F0-25, ADR 0025), contra la base
 * real: reintento con espera creciente, y si agota, **encola** en `fallidos`,
 * loguea con código y relanza con `INF-0002`. Nada falla en silencio.
 *
 * La espera se inyecta (`esperar` en la política): el test no duerme y
 * afirma la secuencia exacta de esperas pedidas.
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
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  ErrorSistema,
  nuevoError,
} from "../../src/dominio/compartido/errores/error-sistema.ts";
import { crearLog } from "../../src/infraestructura/log.ts";
import {
  crearConReintento,
  ESPERAS_POR_DEFECTO,
  INTENTOS_POR_DEFECTO,
} from "../../src/infraestructura/reintento.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

let prisma: ReturnType<typeof crearClientePrisma> | undefined;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

/** Un log que escribe en memoria, para leer las líneas después. */
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

/** Una espera que no duerme: anota cuántos milisegundos le pidieron. */
function esperaAnotada() {
  const pedidas: number[] = [];
  return {
    pedidas,
    esperar: (ms: number) => {
      pedidas.push(ms);
      return Promise.resolve();
    },
  };
}

/** El doble que falla siempre: un adaptador externo caído. */
function adaptadorQueFallaSiempre(error: unknown) {
  let llamadas = 0;
  return {
    llamadas: () => llamadas,
    enviar: () => {
      llamadas += 1;
      return Promise.reject(error);
    },
  };
}

describe("conReintento", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test("por defecto: 3 intentos, esperas de 1 s, 10 s y 60 s (la tercera, con 4 intentos)", () => {
    expect(INTENTOS_POR_DEFECTO).toBe(3);
    expect(ESPERAS_POR_DEFECTO).toEqual([1000, 10_000, 60_000]);
  });

  test("un adaptador que falla siempre: fila en fallidos con el código, log con código, y el que llama ve el error", async () => {
    const db = cliente();
    const { log, registros } = logEnMemoria();
    const conReintento = crearConReintento({
      cola: crearColaFallidosPrisma(db),
      log,
    });
    const espera = esperaAnotada();
    const adaptador = adaptadorQueFallaSiempre(
      nuevoError(catalogo.ALM_0001, { clave: "documento-inventado.pdf" }),
    );

    const intento = conReintento(adaptador.enviar, {
      origen: "prueba.almacen",
      carga: { clave: "documento-inventado.pdf" },
      esperar: espera.esperar,
    });

    // El que llama ve el error, con código: nada de éxito ni `undefined`.
    const error = await intento.then(
      () => null,
      (causa: unknown) => causa,
    );
    expect(error).toBeInstanceOf(ErrorSistema);
    expect((error as ErrorSistema).codigo).toBe("INF-0002");
    expect((error as ErrorSistema).cause).toBeInstanceOf(ErrorSistema);

    // Tres intentos, con las dos primeras esperas entre ellos.
    expect(adaptador.llamadas()).toBe(3);
    expect(espera.pedidas).toEqual([1000, 10_000]);

    // Una fila pendiente en `fallidos`, con el código del último error.
    const filas = await db.fallido.findMany();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      origen: "prueba.almacen",
      codigoError: "ALM-0001",
      carga: { clave: "documento-inventado.pdf" },
      intentos: 3,
      resueltoEn: null,
      proximoIntento: null,
    });

    // El log dice qué pasó, con código (el aviso al administrador, hasta F0-29).
    const lineaError = registros().find((r) => r.level === "error");
    expect(lineaError).toMatchObject({
      codigo: "INF-0002",
      origen: "prueba.almacen",
      intentos: 3,
      codigoCausa: "ALM-0001",
    });
  });

  test("un error sin código se encola con INF-0001", async () => {
    const db = cliente();
    const conReintento = crearConReintento({
      cola: crearColaFallidosPrisma(db),
      log: logEnMemoria().log,
    });
    const adaptador = adaptadorQueFallaSiempre(new Error("se cortó"));

    await expect(
      conReintento(adaptador.enviar, {
        origen: "prueba.correo",
        carga: { mensaje: 1 },
        esperar: esperaAnotada().esperar,
      }),
    ).rejects.toMatchObject({ codigo: "INF-0002" });

    const filas = await db.fallido.findMany();
    expect(filas.map((f) => f.codigoError)).toEqual(["INF-0001"]);
  });

  test("con 4 intentos usa las tres esperas, en orden", async () => {
    const db = cliente();
    const conReintento = crearConReintento({
      cola: crearColaFallidosPrisma(db),
      log: logEnMemoria().log,
    });
    const espera = esperaAnotada();
    const adaptador = adaptadorQueFallaSiempre(new Error("caído"));

    await expect(
      conReintento(adaptador.enviar, {
        origen: "prueba.ia",
        carga: {},
        intentos: 4,
        esperar: espera.esperar,
      }),
    ).rejects.toBeInstanceOf(ErrorSistema);

    expect(adaptador.llamadas()).toBe(4);
    expect(espera.pedidas).toEqual([1000, 10_000, 60_000]);
    const filas = await db.fallido.findMany();
    expect(filas.map((f) => f.intentos)).toEqual([4]);
  });

  test("las esperas son configurables", async () => {
    const db = cliente();
    const conReintento = crearConReintento({
      cola: crearColaFallidosPrisma(db),
      log: logEnMemoria().log,
    });
    const espera = esperaAnotada();
    const adaptador = adaptadorQueFallaSiempre(new Error("caído"));

    await expect(
      conReintento(adaptador.enviar, {
        origen: "prueba.config",
        carga: {},
        esperas: [5, 50],
        esperar: espera.esperar,
      }),
    ).rejects.toBeInstanceOf(ErrorSistema);

    expect(espera.pedidas).toEqual([5, 50]);
  });

  test("si un reintento sale bien, devuelve el valor y no encola nada", async () => {
    const db = cliente();
    const conReintento = crearConReintento({
      cola: crearColaFallidosPrisma(db),
      log: logEnMemoria().log,
    });
    const espera = esperaAnotada();
    let llamadas = 0;

    const valor = await conReintento(
      () => {
        llamadas += 1;
        return llamadas < 2
          ? Promise.reject(new Error("una vez"))
          : Promise.resolve("listo");
      },
      { origen: "prueba.ok", carga: {}, esperar: espera.esperar },
    );

    expect(valor).toBe("listo");
    expect(espera.pedidas).toEqual([1000]);
    expect(await db.fallido.count()).toBe(0);
  });

  test("si ni siquiera se puede encolar, igual loguea con código y relanza INF-0002", async () => {
    const { log, registros } = logEnMemoria();
    const conReintento = crearConReintento({
      cola: {
        encolar: () => Promise.reject(new Error("base caída")),
        listarPendientes: () => Promise.resolve([]),
        contarPendientes: () => Promise.resolve(0),
      },
      log,
    });

    await expect(
      conReintento(() => Promise.reject(new Error("caído")), {
        origen: "prueba.sin-cola",
        carga: {},
        esperar: esperaAnotada().esperar,
      }),
    ).rejects.toMatchObject({ codigo: "INF-0002" });

    const errores = registros().filter((r) => r.level === "error");
    expect(errores.map((r) => r.codigo)).toContain("INF-0002");
    expect(errores.some((r) => r.encolado === false)).toBe(true);
  });

  test("la cola cuenta solo los pendientes", async () => {
    const db = cliente();
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
      where: { origen: "prueba.a" },
      data: { resueltoEn: new Date() },
    });

    expect(await cola.contarPendientes()).toBe(1);
  });
});
