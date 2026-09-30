/**
 * Las dos cookies de la identidad (F0-31, ADR 0027):
 *
 * - `seism_sesion`: el token de la sesión (256 bits, F0-30). `httpOnly`,
 *   `Secure`, `SameSite=Lax`, `Path=/`, 12 horas (lo que dura la sesión en la
 *   base). **Solo con `APP_ENTORNO=local` va sin `Secure`**: `next dev` y el
 *   e2e corren sobre `http://localhost`, y un navegador no guarda una cookie
 *   `Secure` que llega por http. En `ci` y `servidor`, siempre `Secure`.
 * - `seism_login`: el `state` y el verificador PKCE entre `iniciar` y el
 *   `callback`. `httpOnly`, 10 minutos, y solo viaja a `/ingresar`.
 *
 * La validación de la sesión no está acá: la cookie es solo el token, y cada
 * request lo valida contra la base (`src/casos-uso/sesion/`).
 */

import { z } from "zod";
import { DURACION_SESION_SEGUNDOS } from "../../casos-uso/sesion/sesion.ts";
import type { EstadoLogin } from "../../puertos/identidad.ts";

export const COOKIE_SESION = "seism_sesion";
export const COOKIE_LOGIN = "seism_login";

/** Lo que dura un login empezado: el tiempo de elegir la cuenta en Google. */
const DURACION_LOGIN_SEGUNDOS = 10 * 60;

type AppEntorno = "local" | "ci" | "servidor";

export type OpcionesCookie = {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "lax";
  readonly path: string;
  readonly maxAge: number;
};

function opciones(
  appEntorno: AppEntorno,
  path: string,
  maxAge: number,
): OpcionesCookie {
  return {
    httpOnly: true,
    secure: appEntorno !== "local",
    sameSite: "lax",
    path,
    maxAge,
  };
}

export function opcionesCookieSesion(appEntorno: AppEntorno): OpcionesCookie {
  return opciones(appEntorno, "/", DURACION_SESION_SEGUNDOS);
}

export function opcionesCookieLogin(appEntorno: AppEntorno): OpcionesCookie {
  return opciones(appEntorno, "/ingresar", DURACION_LOGIN_SEGUNDOS);
}

const esquemaEstadoLogin = z.object({
  state: z.string().min(1),
  verificadorPkce: z.string().min(1),
});

/** El valor de la cookie del login: el estado en JSON, en base64url. */
export function codificarEstadoLogin(estado: EstadoLogin): string {
  return Buffer.from(JSON.stringify(estado)).toString("base64url");
}

/** La vuelta de `codificarEstadoLogin`; `null` si no hay cookie o no se lee. */
export function leerEstadoLogin(valor: string | undefined): EstadoLogin | null {
  if (valor === undefined || valor === "") {
    return null;
  }
  try {
    const leido = esquemaEstadoLogin.safeParse(
      JSON.parse(Buffer.from(valor, "base64url").toString("utf8")),
    );
    return leido.success ? leido.data : null;
  } catch {
    return null;
  }
}
