/**
 * `listarSalud()` (F0-25, F0-26): lo que muestra el panel de salud (`/salud`).
 *
 * - **Jobs**: la última corrida de cada job pedido (`null` si nunca corrió),
 *   hace cuánto empezó y **de qué color está**. El color lo decide este caso
 *   de uso, no la página: rojo si nunca corrió, si su última corrida terminó
 *   en `error`, si no se pudo leer, o si su última corrida empezó hace más
 *   del doble de su intervalo, **aunque haya sido `ok`** (un worker caído tres
 *   días tiene que verse rojo).
 * - **Fallidos pendientes**: cuántos siguen sin `resuelto_en` y los
 *   `LIMITE_FALLIDOS` más viejos, con su código y su edad. Nunca la carga.
 * - **Integraciones**: cada sonda, `ok` o `error`, y el instante de su última
 *   prueba exitosa. No hay historial de sondas: ese instante vive en la
 *   memoria del proceso (`MemoriaDePruebas`), la arma una sola vez el punto
 *   de armado y se pierde al reiniciar.
 * - **Gasto de IA** del mes contra el tope (`gastoDelMes`, F0-28), rojo si
 *   lo gastado alcanza el tope.
 *
 * **Nunca lanza.** Justo cuando algo está caído es cuando más hace falta el
 * panel: una sonda que rechaza queda en `error`, y si no se pudo leer una
 * corrida, los pendientes o el gasto, se dice (`error` en el job,
 * `fallidosPendientes: null`, `gastoIa: { tipo: "error" }`) en vez de inventar
 * un "nunca corrió" o un cero. Los detalles son `CODIGO · descripción` del
 * catálogo: nunca el mensaje crudo de una excepción, que puede traer datos de
 * la conexión.
 *
 * "Ahora" sale del `Reloj` inyectado. Las fechas de la base son instantes
 * (`Date`); `aFechaHora` los pasa al mismo reloj civil que el `Reloj` para
 * poder restarlos (`diferenciaEnMilisegundos`).
 */

import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { ErrorSistema } from "../../dominio/compartido/errores/error-sistema.ts";
import {
  diferenciaEnMilisegundos,
  type FechaHora,
  formatearISO,
  type Reloj,
} from "../../dominio/compartido/reloj.ts";
import type { ColaFallidos } from "../../puertos/cola-fallidos.ts";
import type {
  Corrida,
  RegistroCorridas,
} from "../../puertos/repositorios/corridas-worker.ts";
import type { SondaIntegracion } from "../../puertos/sonda-integracion.ts";
import type { GastoDelMes } from "../ia/gasto-del-mes.ts";

/** Cuántos fallidos pendientes lista el panel (el total se muestra aparte). */
export const LIMITE_FALLIDOS = 50;

/** Un job del panel: su nombre y cada cuánto corre (ver `src/worker/jobs.ts`). */
export type JobDelPanel = {
  readonly nombre: string;
  readonly intervaloMs: number;
};

export type UltimaCorrida = Omit<Corrida, "job"> & {
  /** Milisegundos desde que empezó, según el reloj inyectado. */
  readonly haceMs: number;
};

export type EstadoJob = {
  readonly job: string;
  readonly estado: "ok" | "rojo";
  /** Solo en rojo: por qué. */
  readonly motivo?: string;
  readonly ultimaCorrida: UltimaCorrida | null;
  /** Solo si no se pudo leer la última corrida: `CODIGO · descripción`. */
  readonly error?: string;
};

export type FallidoListado = {
  readonly id: string;
  readonly origen: string;
  readonly codigoError: string;
  readonly haceMs: number;
};

export type EstadoIntegracion = {
  readonly nombre: string;
  readonly estado: "ok" | "error";
  /** Solo con `error`: `CODIGO · descripción`. */
  readonly detalle?: string;
  /** La última prueba `ok` desde que arrancó el proceso; `null` si no hubo. */
  readonly ultimaPruebaOk: {
    /** `AAAA-MM-DD HH:MM:SS`. */
    readonly en: string;
    readonly haceMs: number;
  } | null;
};

export type GastoIa =
  | {
      readonly tipo: "gasto";
      readonly estado: "ok" | "rojo";
      /** `AAAA-MM`. */
      readonly mes: string;
      readonly gastadoUsd: string;
      readonly topeUsd: string;
    }
  | {
      readonly tipo: "error";
      /** `CODIGO · descripción`. */
      readonly detalle: string;
    };

export type Salud = {
  readonly jobs: readonly EstadoJob[];
  /** `null` si no se pudo contar (la base no respondió). */
  readonly fallidosPendientes: number | null;
  /** Los más viejos, hasta `LIMITE_FALLIDOS`; `null` si no se pudo leer. */
  readonly fallidos: readonly FallidoListado[] | null;
  readonly integraciones: readonly EstadoIntegracion[];
  readonly gastoIa: GastoIa;
};

/** El instante (del `Reloj`) de la última prueba exitosa de cada sonda. */
export type MemoriaDePruebas = {
  recordar(nombre: string, en: FechaHora): void;
  ultima(nombre: string): FechaHora | null;
};

export function memoriaDePruebasVacia(): MemoriaDePruebas {
  const ultimas = new Map<string, FechaHora>();
  return {
    recordar(nombre, en) {
      ultimas.set(nombre, en);
    },
    ultima(nombre) {
      return ultimas.get(nombre) ?? null;
    },
  };
}

export type DependenciasSalud = {
  readonly reloj: Reloj;
  /** De un instante de la base al reloj civil del `Reloj` (el del sistema). */
  readonly aFechaHora: (instante: Date) => FechaHora;
  /** Los jobs que tiene que mostrar, hayan corrido o no. */
  readonly jobs: readonly JobDelPanel[];
  readonly corridas: RegistroCorridas;
  readonly fallidos: ColaFallidos;
  readonly sondas: readonly SondaIntegracion[];
  readonly pruebasExitosas: MemoriaDePruebas;
  /** `gastoDelMes` ya armado con sus puertos: puede lanzar. */
  readonly gastoIa: () => Promise<GastoDelMes>;
};

/** `CODIGO · descripción` de una falla; sin código, la genérica `INF-0001`. */
function describir(causa: unknown): string {
  const entrada =
    causa instanceof ErrorSistema ? causa.entrada : catalogo.INF_0001;
  return `${entrada.codigo} · ${entrada.descripcion}`;
}

function edadMs(deps: DependenciasSalud, instante: Date): number {
  return diferenciaEnMilisegundos(
    deps.reloj.ahora(),
    deps.aFechaHora(instante),
  );
}

function colorDeJob(
  job: JobDelPanel,
  ultima: UltimaCorrida,
): Pick<EstadoJob, "estado" | "motivo"> {
  if (ultima.resultado === "error") {
    return { estado: "rojo", motivo: "la última corrida terminó en error" };
  }
  if (ultima.haceMs > 2 * job.intervaloMs) {
    return { estado: "rojo", motivo: "no corrió en el doble de su intervalo" };
  }
  return { estado: "ok" };
}

async function estadoDeJob(
  job: JobDelPanel,
  deps: DependenciasSalud,
): Promise<EstadoJob> {
  try {
    const corrida = await deps.corridas.ultimaCorrida(job.nombre);
    if (corrida === null) {
      return {
        job: job.nombre,
        estado: "rojo",
        motivo: "nunca corrió",
        ultimaCorrida: null,
      };
    }
    const { inicio, fin, resultado, detalle } = corrida;
    const ultimaCorrida = {
      inicio,
      fin,
      resultado,
      detalle,
      haceMs: edadMs(deps, inicio),
    };
    return {
      job: job.nombre,
      ...colorDeJob(job, ultimaCorrida),
      ultimaCorrida,
    };
  } catch (causa) {
    return {
      job: job.nombre,
      estado: "rojo",
      motivo: "no se pudo leer la última corrida",
      ultimaCorrida: null,
      error: describir(causa),
    };
  }
}

async function contarPendientes(
  fallidos: ColaFallidos,
): Promise<number | null> {
  try {
    return await fallidos.contarPendientes();
  } catch {
    return null;
  }
}

async function listarPendientes(
  deps: DependenciasSalud,
): Promise<readonly FallidoListado[] | null> {
  try {
    const pendientes = await deps.fallidos.listarPendientes(LIMITE_FALLIDOS);
    return pendientes.map((pendiente) => ({
      id: pendiente.id,
      origen: pendiente.origen,
      codigoError: pendiente.codigoError,
      haceMs: edadMs(deps, pendiente.creadoEn),
    }));
  } catch {
    return null;
  }
}

/** `AAAA-MM-DD HH:MM:SS`, sin milisegundos. */
function textoDeInstante(fechaHora: FechaHora): string {
  return formatearISO(fechaHora).slice(0, 19).replace("T", " ");
}

async function estadoDeIntegracion(
  sonda: SondaIntegracion,
  deps: DependenciasSalud,
): Promise<EstadoIntegracion> {
  const ahora = deps.reloj.ahora();
  let estado: Pick<EstadoIntegracion, "estado" | "detalle">;
  try {
    await sonda.probar();
    deps.pruebasExitosas.recordar(sonda.nombre, ahora);
    estado = { estado: "ok" };
  } catch (causa) {
    estado = { estado: "error", detalle: describir(causa) };
  }
  const ultimaOk = deps.pruebasExitosas.ultima(sonda.nombre);
  return {
    nombre: sonda.nombre,
    ...estado,
    ultimaPruebaOk:
      ultimaOk === null
        ? null
        : {
            en: textoDeInstante(ultimaOk),
            haceMs: diferenciaEnMilisegundos(ahora, ultimaOk),
          },
  };
}

async function gastoDeIa(deps: DependenciasSalud): Promise<GastoIa> {
  try {
    const gasto = await deps.gastoIa();
    return {
      tipo: "gasto",
      estado: gasto.gastadoMicroUsd >= gasto.topeMicroUsd ? "rojo" : "ok",
      mes: gasto.mes,
      gastadoUsd: gasto.gastadoUsd,
      topeUsd: gasto.topeUsd,
    };
  } catch (causa) {
    return { tipo: "error", detalle: describir(causa) };
  }
}

export async function listarSalud(deps: DependenciasSalud): Promise<Salud> {
  const [jobs, fallidosPendientes, fallidos, integraciones, gastoIa] =
    await Promise.all([
      Promise.all(deps.jobs.map((job) => estadoDeJob(job, deps))),
      contarPendientes(deps.fallidos),
      listarPendientes(deps),
      Promise.all(deps.sondas.map((sonda) => estadoDeIntegracion(sonda, deps))),
      gastoDeIa(deps),
    ]);
  return { jobs, fallidosPendientes, fallidos, integraciones, gastoIa };
}
