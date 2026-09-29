/**
 * F0-28 · `interpretar` contra Postgres de verdad (criterios 1 y 3; R4, R8).
 *
 * - La salida del adaptador se valida con el esquema Zod del que llama; si no
 *   valida, `IA-0002` con los problemas de Zod en `detalles`.
 * - Toda llamada al adaptador deja su fila en `uso_ia` **antes** de que
 *   `interpretar` devuelva o lance `IA-0002`, también cuando la salida es
 *   inválida (con la propuesta cruda y `propuesta_valida = false`).
 * - Si no se puede escribir la fila, `interpretar` no devuelve la propuesta.
 *
 * El tope de gasto tiene su propio archivo (`ia-tope.test.ts`); acá el tope
 * es holgado. Necesita Docker corriendo.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { z } from "zod";
import {
  type CasoIaDoble,
  crearIaDoble,
} from "../../src/adaptadores/ia-doble/ia-doble.ts";
import { crearAvisosIaPorLog } from "../../src/adaptadores/log/avisos-ia.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearLectorConfiguracion } from "../../src/adaptadores/prisma/configuracion.ts";
import { crearRepositorioUsoIa } from "../../src/adaptadores/prisma/uso-ia.ts";
import { crearInterpretar } from "../../src/casos-uso/ia/interpretar.ts";
import { ErrorSistema } from "../../src/dominio/compartido/errores/error-sistema.ts";
import { RelojFijo } from "../../src/dominio/compartido/reloj.ts";
import type { RepositorioUsoIa } from "../../src/puertos/repositorios/uso-ia.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import {
  type ClientePrisma,
  capturarLog,
  fecha,
  fijarConfiguracion,
} from "./_arnes/ia.ts";

const PERFIL = "remito-ficticio";
const ENTRADA = "Remito 0001 de Ferretería Inventada";

const CASOS: readonly CasoIaDoble[] = [
  {
    perfil: PERFIL,
    entrada: ENTRADA,
    respuesta: {
      salida: { proveedor: "Ferretería Inventada", items: 3 },
      modelo: "modelo-de-prueba",
      versionPrompt: "v-prueba-1",
      costoMicroUsd: 1_500n,
      tokens: 42,
    },
  },
  {
    perfil: PERFIL,
    entrada: "salida rota",
    respuesta: {
      salida: { proveedor: 7 },
      modelo: "modelo-de-prueba",
      versionPrompt: "v-prueba-1",
      costoMicroUsd: 2_000n,
      tokens: 17,
    },
  },
];

const esquemaRemito = z.object({
  proveedor: z.string(),
  items: z.number().int(),
});

/** 15 de septiembre de 2026, 14:30 en la Argentina = 17:30 UTC. */
const AHORA = fecha({ anio: 2026, mes: 9, dia: 15, hora: 14, minuto: 30 });
const AHORA_UTC = new Date("2026-09-15T17:30:00.000Z");

let prisma: ClientePrisma | undefined;

function db(): ClientePrisma {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ClientePrisma;
}

function armar(usos: RepositorioUsoIa = crearRepositorioUsoIa(db())) {
  const doble = crearIaDoble(CASOS);
  const interpretar = crearInterpretar({
    adaptador: doble,
    usos,
    configuracion: crearLectorConfiguracion(db()),
    reloj: RelojFijo(AHORA),
    avisos: crearAvisosIaPorLog(capturarLog().log),
  });
  return { doble, interpretar };
}

/** Un repositorio real que tarda en guardar y avisa cuándo terminó. */
function usosLentos(): RepositorioUsoIa & { terminado(): boolean } {
  const real = crearRepositorioUsoIa(db());
  let terminado = false;
  return {
    async registrar(registro) {
      await new Promise((resolver) => setTimeout(resolver, 50));
      await real.registrar(registro);
      terminado = true;
    },
    costoEntre: (desde, hasta) => real.costoEntre(desde, hasta),
    terminado: () => terminado,
  };
}

describe("interpretar", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
    await fijarConfiguracion(db(), {
      "ia.tope_mensual_usd": "100.00",
      "ia.costo_estimado_usd.defecto": "0.01",
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test("valida la salida con el esquema del que llama y devuelve propuesta, modelo, versionPrompt, costo y tokens", async () => {
    const { interpretar, doble } = armar();

    const resultado = await interpretar({
      perfil: PERFIL,
      entrada: ENTRADA,
      esquemaSalida: esquemaRemito,
    });

    expect(resultado).toEqual({
      propuesta: { proveedor: "Ferretería Inventada", items: 3 },
      modelo: "modelo-de-prueba",
      versionPrompt: "v-prueba-1",
      costoUsd: 1_500n,
      tokens: 42,
    });
    expect(doble.llamadas()).toBe(1);
  });

  test("deja la fila de uso_ia con todos sus campos y la decisión humana vacía", async () => {
    const { interpretar } = armar();

    await interpretar({
      perfil: PERFIL,
      entrada: ENTRADA,
      esquemaSalida: esquemaRemito,
    });

    const filas = await db().usoIa.findMany();
    expect(filas).toHaveLength(1);
    const [fila] = filas;
    expect(fila?.en).toEqual(AHORA_UTC);
    expect(fila?.costoUsd.toFixed(6)).toBe("0.001500");
    expect(fila).toMatchObject({
      perfil: PERFIL,
      modelo: "modelo-de-prueba",
      versionPrompt: "v-prueba-1",
      tokens: 42,
      propuesta: { proveedor: "Ferretería Inventada", items: 3 },
      propuestaValida: true,
      decisionHumana: null,
      decididoPor: null,
      decididoEn: null,
    });
  });

  test("una salida que no valida es IA-0002 con los problemas de Zod, y la fila queda con la propuesta cruda", async () => {
    const { interpretar } = armar();

    const error = await interpretar({
      perfil: PERFIL,
      entrada: "salida rota",
      esquemaSalida: esquemaRemito,
    }).then(
      () => undefined,
      (motivo: unknown) => motivo,
    );

    expect(error).toBeInstanceOf(ErrorSistema);
    const errorIa = error as ErrorSistema;
    expect(errorIa.codigo).toBe("IA-0002");
    expect(errorIa.detalles).toMatchObject({
      perfil: PERFIL,
      modelo: "modelo-de-prueba",
      versionPrompt: "v-prueba-1",
      problemas: expect.arrayContaining([
        expect.objectContaining({ ruta: "proveedor" }),
        expect.objectContaining({ ruta: "items" }),
      ]),
    });

    const filas = await db().usoIa.findMany();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      propuesta: { proveedor: 7 },
      propuestaValida: false,
      tokens: 17,
    });
    expect(filas[0]?.costoUsd.toFixed(6)).toBe("0.002000");
  });

  test("la fila está escrita antes de que interpretar devuelva", async () => {
    const usos = usosLentos();
    const { interpretar } = armar(usos);

    const escritaAlDevolver = await interpretar({
      perfil: PERFIL,
      entrada: ENTRADA,
      esquemaSalida: esquemaRemito,
    }).then(() => usos.terminado());

    expect(escritaAlDevolver).toBe(true);
  });

  test("la fila está escrita antes de que interpretar lance IA-0002", async () => {
    const usos = usosLentos();
    const { interpretar } = armar(usos);

    const escritaAlLanzar = await interpretar({
      perfil: PERFIL,
      entrada: "salida rota",
      esquemaSalida: esquemaRemito,
    }).then(
      () => "devolvió",
      () => usos.terminado(),
    );

    expect(escritaAlLanzar).toBe(true);
  });

  test("si no se puede escribir la fila, no devuelve la propuesta: lanza con código", async () => {
    const real = crearRepositorioUsoIa(db());
    const falla = new Error("la base se cayó (simulado)");
    const { interpretar, doble } = armar({
      registrar: () => Promise.reject(falla),
      costoEntre: (desde, hasta) => real.costoEntre(desde, hasta),
    });

    const error = await interpretar({
      perfil: PERFIL,
      entrada: ENTRADA,
      esquemaSalida: esquemaRemito,
    }).then(
      () => undefined,
      (motivo: unknown) => motivo,
    );

    expect(doble.llamadas()).toBe(1);
    expect(error).toBeInstanceOf(ErrorSistema);
    expect((error as ErrorSistema).codigo).toBe("INF-0001");
    expect((error as ErrorSistema).cause).toBe(falla);
  });
});
