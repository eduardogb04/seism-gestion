/**
 * La vuelta del proveedor de identidad (F0-31): Google —o la pantalla de la
 * identidad falsa— manda acá el `code` y el `state`.
 *
 * 1. Lee el `state` guardado en la cookie temporal y la borra (un login se
 *    completa una sola vez).
 * 2. `completarLogin` compara el `state` (`AUT-0002` si no coincide) y
 *    verifica la identidad (`AUT-0001` si no).
 * 3. `completarSesion` decide si entra: si el email no es un usuario activo,
 *    `AUT-0001` sin crear nada; si lo es, abre la sesión y la cookie
 *    `seism_sesion` lleva su token.
 *
 * Un error del catálogo manda a `/ingresar/error?codigo=...`; uno inesperado
 * sigue de largo (queda en el log del servidor).
 */

import { type NextRequest, NextResponse } from "next/server.js";
import { codigoDeError } from "../../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../../infraestructura/arranque/armado.ts";
import {
  COOKIE_LOGIN,
  COOKIE_SESION,
  leerEstadoLogin,
  opcionesCookieLogin,
  opcionesCookieSesion,
} from "../../cookies.ts";

function irA(destino: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: destino },
  });
}

function aError(codigo: string): NextResponse {
  return irA(`/ingresar/error?${new URLSearchParams({ codigo })}`);
}

async function completar(request: NextRequest): Promise<NextResponse> {
  const { identidad, sesion, appEntorno } = armado();
  const guardado = leerEstadoLogin(request.cookies.get(COOKIE_LOGIN)?.value);
  const codigo = request.nextUrl.searchParams.get("code");
  if (guardado === null || codigo === null) {
    return aError("AUT-0002");
  }
  try {
    const verificada = await identidad.completarLogin(codigo, {
      guardado,
      stateRecibido: request.nextUrl.searchParams.get("state"),
    });
    const abierta = await sesion.completarSesion(
      verificada,
      request.headers.get("user-agent"),
    );
    const respuesta = irA("/sesion");
    respuesta.cookies.set(
      COOKIE_SESION,
      abierta.id,
      opcionesCookieSesion(appEntorno),
    );
    return respuesta;
  } catch (error) {
    const codigoError = codigoDeError(error);
    if (codigoError === null) {
      throw error;
    }
    return aError(codigoError);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const respuesta = await completar(request);
  respuesta.cookies.set(COOKIE_LOGIN, "", {
    ...opcionesCookieLogin(armado().appEntorno),
    maxAge: 0,
  });
  return respuesta;
}
