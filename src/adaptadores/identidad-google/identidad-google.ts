/**
 * El adaptador de identidad de Google (F0-31, ADR 0027): OIDC con `arctic`
 * (3.7.0), con `state` y PKCE (S256).
 *
 * - `iniciarLogin`: la dirección de autorización de Google con el `state` y
 *   el desafío PKCE del verificador que generó la app; pide `openid` y
 *   `email`, y vuelve a `<APP_URL_PUBLICA>/ingresar/callback`.
 * - `completarLogin`: compara el `state` **antes de nada** (`AUT-0002`),
 *   canjea el código con el verificador (arctic), baja las JWKS de Google y
 *   verifica el `id_token` (`verificarIdToken`: firma, `alg`, `kid`, `iss`,
 *   `aud`, `exp` con el reloj inyectado y `email_verified`).
 *
 * Las JWKS se piden en cada login (son pocos: diez personas): así una
 * rotación de claves de Google nunca deja una clave vieja en memoria.
 *
 * Se prueba a mano en local (F0-34, RUNBOOK); la verificación del token y lo
 * que no sale a la red, en `tests/dominio/identidad-google.test.ts`.
 */

import { ArcticFetchError, Google, OAuth2RequestError } from "arctic";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import type { Identidad } from "../../puertos/identidad.ts";
import {
  esquemaJwks,
  type Jwks,
  verificarIdToken,
} from "./verificar-id-token.ts";

/** Las claves públicas con que Google firma los `id_token`. */
const URL_JWKS = "https://www.googleapis.com/oauth2/v3/certs";

/** Adónde vuelve Google, relativo a `APP_URL_PUBLICA` (`src/app/(auth)/ingresar/callback/route.ts`). */
export const RUTA_CALLBACK = "/ingresar/callback";

export type ConfiguracionGoogle = {
  /** `GOOGLE_CLIENT_ID`. */
  readonly clienteId: string;
  /** `GOOGLE_CLIENT_SECRET`. */
  readonly secreto: string;
  /** `APP_URL_PUBLICA`. */
  readonly urlPublica: string;
  readonly reloj: Reloj;
};

async function pedirJwks(): Promise<Jwks> {
  let respuesta: Response;
  let cuerpo: unknown;
  try {
    respuesta = await fetch(URL_JWKS);
    cuerpo = respuesta.ok ? await respuesta.json() : null;
  } catch (causa) {
    throw nuevoError(
      catalogo.INF_0001,
      { motivo: "no se pudieron bajar las JWKS de Google" },
      causa,
    );
  }
  if (!respuesta.ok) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "Google no entregó las JWKS",
      estado: respuesta.status,
    });
  }
  const jwks = esquemaJwks.safeParse(cuerpo);
  if (!jwks.success) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "las JWKS de Google no tienen la forma esperada",
    });
  }
  return jwks.data;
}

export function crearIdentidadGoogle({
  clienteId,
  secreto,
  urlPublica,
  reloj,
}: ConfiguracionGoogle): Identidad {
  const google = new Google(
    clienteId,
    secreto,
    new URL(RUTA_CALLBACK, urlPublica).toString(),
  );

  /** Canjea el código por el `id_token`. Un código que Google rechaza es `AUT-0001`. */
  async function canjear(codigo: string, verificador: string): Promise<string> {
    try {
      const tokens = await google.validateAuthorizationCode(
        codigo,
        verificador,
      );
      return tokens.idToken();
    } catch (causa) {
      if (causa instanceof OAuth2RequestError) {
        throw nuevoError(
          catalogo.AUT_0001,
          { motivo: "Google rechazó el código", error: causa.code },
          causa,
        );
      }
      const motivo =
        causa instanceof ArcticFetchError
          ? "no se pudo hablar con Google para canjear el código"
          : "la respuesta de Google al canjear el código no es la esperada";
      throw nuevoError(catalogo.INF_0001, { motivo }, causa);
    }
  }

  return {
    iniciarLogin(estado) {
      const url = google.createAuthorizationURL(
        estado.state,
        estado.verificadorPkce,
        ["openid", "email"],
      );
      url.searchParams.set("prompt", "select_account");
      return url.toString();
    },

    async completarLogin(codigo, { guardado, stateRecibido }) {
      if (stateRecibido === null || stateRecibido !== guardado.state) {
        throw nuevoError(catalogo.AUT_0002, {
          motivo: "el state del login no coincide con el guardado",
        });
      }
      const idToken = await canjear(codigo, guardado.verificadorPkce);
      const jwks = await pedirJwks();
      return verificarIdToken(idToken, {
        jwks,
        clienteId,
        ahora: reloj.ahora(),
      });
    },
  };
}
