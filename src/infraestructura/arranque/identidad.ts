/**
 * Punto de armado de la identidad (F0-31, ADR 0027): elige el adaptador según
 * `IDENTIDAD` y genera el `state` y el verificador PKCE de cada login.
 *
 * - `IDENTIDAD=google` → `identidad-google` con `GOOGLE_CLIENT_ID`,
 *   `GOOGLE_CLIENT_SECRET` y `APP_URL_PUBLICA` (el esquema del entorno ya
 *   exigió las tres).
 * - `IDENTIDAD=falsa` → `identidad-falsa`, que lista `ADMIN_INICIAL_EMAIL` y
 *   tres emails inventados: dos pensados para darlos de alta como operador (el
 *   e2e de usuarios revoca al suyo, así que el de los catálogos usa el otro) y
 *   uno que nunca tiene usuario, para ver el rebote (`AUT-0001`). El esquema
 *   ya rechazó la falsa en el servidor.
 */

import { randomBytes } from "node:crypto";
import { crearIdentidadFalsa } from "../../adaptadores/identidad-falsa/identidad-falsa.ts";
import { crearIdentidadGoogle } from "../../adaptadores/identidad-google/identidad-google.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import type { EstadoLogin, Identidad } from "../../puertos/identidad.ts";
import type { Entorno } from "../entorno.ts";

/** Los emails inventados que la identidad falsa muestra además de `ADMIN_INICIAL_EMAIL`. */
export const EMAILS_INVENTADOS = [
  "operador@ejemplo.test",
  "operador.catalogos@ejemplo.test",
  "sin-acceso@ejemplo.test",
] as const;

/** Lo que la pantalla de la identidad falsa necesita; `null` con Google. */
export type Pruebas = {
  readonly emails: readonly string[];
  codigoPara(email: string): string;
};

export type IdentidadArmada = {
  readonly identidad: Identidad;
  readonly pruebas: Pruebas | null;
};

export function elegirIdentidad(
  entorno: Entorno,
  reloj: Reloj,
): IdentidadArmada {
  if (entorno.IDENTIDAD === "falsa") {
    const falsa = crearIdentidadFalsa([
      entorno.ADMIN_INICIAL_EMAIL,
      ...EMAILS_INVENTADOS,
    ]);
    return { identidad: falsa, pruebas: falsa };
  }
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL_PUBLICA } = entorno;
  if (
    GOOGLE_CLIENT_ID === undefined ||
    GOOGLE_CLIENT_SECRET === undefined ||
    APP_URL_PUBLICA === undefined
  ) {
    throw nuevoError(catalogo.INF_0001, {
      motivo:
        "IDENTIDAD=google sin GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o APP_URL_PUBLICA (el esquema del entorno tendría que haberlo rechazado)",
    });
  }
  return {
    identidad: crearIdentidadGoogle({
      clienteId: GOOGLE_CLIENT_ID,
      secreto: GOOGLE_CLIENT_SECRET,
      urlPublica: APP_URL_PUBLICA,
      reloj,
    }),
    pruebas: null,
  };
}

/** 256 bits aleatorios en base64url (43 caracteres). */
function aleatorio(): string {
  return randomBytes(32).toString("base64url");
}

/** Un `state` y un verificador PKCE nuevos, para un login que empieza. */
export function generarEstadoLogin(): EstadoLogin {
  return { state: aleatorio(), verificadorPkce: aleatorio() };
}
