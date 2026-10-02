/**
 * La sesión actual, del lado del servidor (F0-31): lee la cookie
 * `seism_sesion` y la valida **contra la base** (caché de 30 s como máximo,
 * `src/casos-uso/sesion/`). `null` si no hay sesión o no valida.
 *
 * Vive aparte de `sesion-actual.ts` porque un Route Handler no puede importar
 * `next/navigation.js` (el build falla al resolver el contexto del router en
 * una ruta): quien tiene que decidir qué hacer sin sesión (`redirect`, o un 401
 * en `src/app/documentos/`) parte de acá.
 */

import { cookies } from "next/headers.js";
import {
  type SesionValida,
  sesionDesdeCookie,
} from "../../casos-uso/sesion/sesion.ts";
import { armado } from "../../infraestructura/arranque/armado.ts";
import { COOKIE_SESION } from "./cookies.ts";

export async function sesionActual(): Promise<SesionValida | null> {
  const almacen = await cookies();
  return sesionDesdeCookie(almacen.get(COOKIE_SESION)?.value, armado().sesion);
}
