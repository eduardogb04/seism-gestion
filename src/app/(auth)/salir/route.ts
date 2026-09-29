/**
 * Cerrar sesión (F0-31): quita la sesión de la base (y de la caché), borra la
 * cookie y vuelve a la página de entrada. Solo por `POST` (un formulario): la
 * cookie es `SameSite=Lax`, así que otro sitio no puede cerrarle la sesión a
 * nadie con un `POST` propio.
 */

import { type NextRequest, NextResponse } from "next/server.js";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { COOKIE_SESION, opcionesCookieSesion } from "../cookies.ts";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { sesion, appEntorno } = armado();
  const token = request.cookies.get(COOKIE_SESION)?.value;
  if (token !== undefined && token !== "") {
    await sesion.cerrarSesion(token);
  }
  const respuesta = new NextResponse(null, {
    status: 303,
    headers: { Location: "/ingresar" },
  });
  respuesta.cookies.set(COOKIE_SESION, "", {
    ...opcionesCookieSesion(appEntorno),
    maxAge: 0,
  });
  return respuesta;
}
