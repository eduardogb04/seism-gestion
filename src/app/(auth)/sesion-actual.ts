/**
 * La sesión actual, del lado del servidor (F0-31): lee la cookie
 * `seism_sesion` y la valida **contra la base** (caché de 30 s como máximo,
 * `src/casos-uso/sesion/`). `null` si no hay sesión o no valida.
 *
 * Desde F0-32 (ADR 0028) también es la protección del panel:
 *
 * - `accesoDeAdministrador()`: lo que **toda página** de `/administracion/**`
 *   (y `/salud`, F0-26) llama antes de leer ningún dato. Sin sesión redirige
 *   a `AUT-0002`; con una persona que no es administradora devuelve
 *   `prohibido` (la página muestra `AUT-0003`); si no, `permitido` con el
 *   `Actor`. No alcanza con un layout: Next no lo vuelve a renderizar al
 *   navegar entre páginas de un mismo segmento.
 * - `actorDesdeSesion()`: el `Actor` de toda acción de escritura. Sale
 *   **solo** de la sesión validada, nunca de un campo del formulario.
 * - `conActorDeSesion()`: lo que hace toda Server Action de escritura con ese
 *   actor: correr el caso de uso y, si lo rechaza, quedarse con el código.
 * - `sesionExigida()` (F1-03): lo que toda página de `/catalogo/**` llama
 *   antes de leer datos. Los catálogos los ve cualquier usuario activo con
 *   sesión; sin sesión, redirige a `AUT-0002`.
 */

import { cookies } from "next/headers.js";
import { redirect } from "next/navigation.js";
import {
  type Acceso,
  actorDeSesion,
  evaluarAccesoDeAdministrador,
} from "../../casos-uso/sesion/acceso.ts";
import { codigoDeError } from "../../casos-uso/sesion/errores.ts";
import {
  type SesionValida,
  sesionDesdeCookie,
} from "../../casos-uso/sesion/sesion.ts";
import type { Actor } from "../../dominio/compartido/actor.ts";
import type { Codigo } from "../../dominio/compartido/errores/catalogo.ts";
import { armado } from "../../infraestructura/arranque/armado.ts";
import { COOKIE_SESION } from "./cookies.ts";

/** A dónde va quien no tiene sesión válida: a ver `AUT-0002` y volver a entrar. */
export const DESTINO_SIN_SESION = "/ingresar/error?codigo=AUT-0002";

export async function sesionActual(): Promise<SesionValida | null> {
  const almacen = await cookies();
  return sesionDesdeCookie(almacen.get(COOKIE_SESION)?.value, armado().sesion);
}

/** El `Actor` de la persona con sesión, o `AUT-0002` si no la hay. */
export async function actorDesdeSesion(): Promise<Actor> {
  return actorDeSesion(await sesionActual());
}

/** Lo que dejó una acción de escritura: lo que devolvió el caso de uso, o el código con que la rechazó. */
type ResultadoDeAccion<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly codigo: Codigo };

/**
 * Corre `trabajo` con el actor de la sesión. Un error del catálogo vuelve como
 * código (sin sesión, redirige a `AUT-0002`); cualquier otro sigue de largo,
 * para que quede en el log del servidor.
 */
export async function conActorDeSesion<T>(
  trabajo: (actor: Actor) => Promise<T>,
): Promise<ResultadoDeAccion<T>> {
  try {
    return { ok: true, valor: await trabajo(await actorDesdeSesion()) };
  } catch (error) {
    const codigo = codigoDeError(error);
    if (codigo === null) {
      throw error;
    }
    if (codigo === "AUT-0002") {
      redirect(DESTINO_SIN_SESION);
    }
    return { ok: false, codigo };
  }
}

/** La sesión de quien entra a una página que solo pide estar adentro. */
export async function sesionExigida(): Promise<SesionValida> {
  const sesion = await sesionActual();
  if (sesion === null) {
    redirect(DESTINO_SIN_SESION);
  }
  return sesion;
}

/** Lo que una página de administración recibe cuando sí hay sesión. */
export type AccesoDeAdministrador = Exclude<Acceso, { tipo: "sin-sesion" }>;

export async function accesoDeAdministrador(): Promise<AccesoDeAdministrador> {
  const acceso = evaluarAccesoDeAdministrador(await sesionActual());
  if (acceso.tipo === "sin-sesion") {
    redirect(DESTINO_SIN_SESION);
  }
  return acceso;
}
