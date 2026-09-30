/**
 * Empieza un login (F0-31): genera el `state` y el verificador PKCE, los
 * guarda en la cookie temporal (`seism_login`, 10 minutos) y manda al
 * navegador adonde diga el adaptador de identidad —Google, o la pantalla de
 * la identidad falsa—.
 */

import { NextResponse } from "next/server.js";
import { armado } from "../../../../infraestructura/arranque/armado.ts";
import {
  COOKIE_LOGIN,
  codificarEstadoLogin,
  opcionesCookieLogin,
} from "../../cookies.ts";

export function GET(): NextResponse {
  const { identidad, appEntorno, generarEstadoLogin } = armado();
  const estado = generarEstadoLogin();
  const respuesta = new NextResponse(null, {
    status: 303,
    headers: { Location: identidad.iniciarLogin(estado) },
  });
  respuesta.cookies.set(
    COOKIE_LOGIN,
    codificarEstadoLogin(estado),
    opcionesCookieLogin(appEntorno),
  );
  return respuesta;
}
