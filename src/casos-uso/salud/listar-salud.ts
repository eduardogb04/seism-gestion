/**
 * `listarSalud()` (F0-25): lo que va a mostrar el panel de salud (F0-26).
 *
 * - **Jobs**: la última corrida de cada job pedido (`null` si nunca corrió).
 * - **Fallidos pendientes**: cuántos siguen sin `resuelto_en`.
 * - **Integraciones**: cada sonda, `ok` o `error` (por ahora solo `base`,
 *   un `SELECT 1`).
 *
 * **Nunca lanza.** Justo cuando algo está caído es cuando más hace falta el
 * panel: una sonda que rechaza queda en `error`, y si no se pudo leer una
 * corrida o los pendientes, se dice (`error` en el job, `fallidosPendientes:
 * null`) en vez de inventar un "nunca corrió" o un cero. Los detalles son
 * `CODIGO · descripción` del catálogo: nunca el mensaje crudo de una
 * excepción, que puede traer datos de la conexión.
 *
 * Recibe sus puertos por parámetro. F0-26 (panel) y F0-28 (gasto de IA) lo
 * consumen o lo extienden: el tipo `Salud` queda exportado.
 */

import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { ErrorSistema } from "../../dominio/compartido/errores/error-sistema.ts";
import type { ColaFallidos } from "../../puertos/cola-fallidos.ts";
import type {
  Corrida,
  RegistroCorridas,
} from "../../puertos/repositorios/corridas-worker.ts";
import type { SondaIntegracion } from "../../puertos/sonda-integracion.ts";

export type UltimaCorrida = Omit<Corrida, "job">;

export type EstadoJob = {
  readonly job: string;
  readonly ultimaCorrida: UltimaCorrida | null;
  /** Solo si no se pudo leer la última corrida: `CODIGO · descripción`. */
  readonly error?: string;
};

export type EstadoIntegracion = {
  readonly nombre: string;
  readonly estado: "ok" | "error";
  /** Solo con `error`: `CODIGO · descripción`. */
  readonly detalle?: string;
};

export type Salud = {
  readonly jobs: readonly EstadoJob[];
  /** `null` si no se pudo contar (la base no respondió). */
  readonly fallidosPendientes: number | null;
  readonly integraciones: readonly EstadoIntegracion[];
};

export type DependenciasSalud = {
  /** Los jobs que tiene que mostrar, hayan corrido o no. */
  readonly jobs: readonly string[];
  readonly corridas: RegistroCorridas;
  readonly fallidos: ColaFallidos;
  readonly sondas: readonly SondaIntegracion[];
};

/** `CODIGO · descripción` de una falla; sin código, la genérica `INF-0001`. */
function describir(causa: unknown): string {
  const entrada =
    causa instanceof ErrorSistema ? causa.entrada : catalogo.INF_0001;
  return `${entrada.codigo} · ${entrada.descripcion}`;
}

async function estadoDeJob(
  job: string,
  corridas: RegistroCorridas,
): Promise<EstadoJob> {
  try {
    const corrida = await corridas.ultimaCorrida(job);
    if (corrida === null) {
      return { job, ultimaCorrida: null };
    }
    const { inicio, fin, resultado, detalle } = corrida;
    return { job, ultimaCorrida: { inicio, fin, resultado, detalle } };
  } catch (causa) {
    return { job, ultimaCorrida: null, error: describir(causa) };
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

async function estadoDeIntegracion(
  sonda: SondaIntegracion,
): Promise<EstadoIntegracion> {
  try {
    await sonda.probar();
    return { nombre: sonda.nombre, estado: "ok" };
  } catch (causa) {
    return { nombre: sonda.nombre, estado: "error", detalle: describir(causa) };
  }
}

export async function listarSalud(deps: DependenciasSalud): Promise<Salud> {
  const [jobs, fallidosPendientes, integraciones] = await Promise.all([
    Promise.all(deps.jobs.map((job) => estadoDeJob(job, deps.corridas))),
    contarPendientes(deps.fallidos),
    Promise.all(deps.sondas.map(estadoDeIntegracion)),
  ]);
  return { jobs, fallidosPendientes, integraciones };
}
