/**
 * Verificación del `id_token` de Google (F0-31, ADR 0027). Sin librerías de
 * JWT: `node:crypto` con la clave pública de las JWKS de Google elegida por
 * `kid` (`createPublicKey({ key: jwk, format: "jwk" })` + `verify`).
 *
 * Rechaza con `AUT-0001` si:
 * - el token no tiene la forma `cabecera.carga.firma` o no es JSON;
 * - `alg` no es `RS256` (ni `none`, ni HMAC, ni otro RSA);
 * - el `kid` no está en las JWKS;
 * - la firma no verifica;
 * - `iss` no es `https://accounts.google.com` ni `accounts.google.com`;
 * - `aud` no es el `GOOGLE_CLIENT_ID`;
 * - `exp` ya pasó según el reloj inyectado (un `exp` igual a "ahora" ya venció);
 * - `email_verified` no es exactamente `true` (ausente, `false` o el texto
 *   `"true"` no valen).
 *
 * Los detalles del error dicen el motivo, nunca el token.
 */

import { createPublicKey, verify } from "node:crypto";
import { z } from "zod";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import {
  type FechaHora,
  formatearISO,
} from "../../dominio/compartido/reloj.ts";
import type { IdentidadVerificada } from "../../puertos/identidad.ts";

/** Los emisores que Google usa en sus `id_token`. */
const EMISORES_GOOGLE = new Set([
  "https://accounts.google.com",
  "accounts.google.com",
]);

/**
 * La operación es argentina (ADR 0012): una `FechaHora` es la fecha civil en
 * UTC-3, sin horario de verano. Es la misma convención que usa la base
 * (`src/adaptadores/prisma/conversiones.ts`).
 */
const DESPLAZAMIENTO_ARGENTINA = "-03:00";

/** Una clave de las JWKS de Google. */
const esquemaClave = z.looseObject({
  kid: z.string().min(1),
  kty: z.literal("RSA"),
  n: z.string().min(1),
  e: z.string().min(1),
});

/** Las JWKS (`https://www.googleapis.com/oauth2/v3/certs`): lo que viene de afuera se valida. */
export const esquemaJwks = z.object({ keys: z.array(esquemaClave) });

export type Jwks = z.infer<typeof esquemaJwks>;

const esquemaCabecera = z.object({ alg: z.string(), kid: z.string() });

const esquemaCarga = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  sub: z.string().min(1),
  email: z.string().min(1),
  email_verified: z.unknown().optional(),
  exp: z.number(),
});

export type DatosVerificacion = {
  readonly jwks: Jwks;
  /** `GOOGLE_CLIENT_ID`: el único `aud` aceptado. */
  readonly clienteId: string;
  /** El momento de la verificación, del reloj inyectado. */
  readonly ahora: FechaHora;
};

function rechazar(motivo: string): never {
  throw nuevoError(catalogo.AUT_0001, { motivo });
}

function leerJson(parte: string): unknown {
  try {
    return JSON.parse(Buffer.from(parte, "base64url").toString("utf8"));
  } catch {
    return rechazar("el id_token no es JSON en base64url");
  }
}

/** Segundos desde la época Unix de una fecha civil argentina. */
function segundosDesdeEpoca(fechaHora: FechaHora): number {
  return (
    Date.parse(`${formatearISO(fechaHora)}${DESPLAZAMIENTO_ARGENTINA}`) / 1000
  );
}

/**
 * ¿La firma RS256 de `datos` verifica con la clave `jwk`? Una clave que
 * `node:crypto` no puede leer cuenta como que no verifica.
 */
function firmaVerifica(
  datos: string,
  firma: string,
  jwk: z.infer<typeof esquemaClave>,
): boolean {
  try {
    return verify(
      "RSA-SHA256",
      Buffer.from(datos),
      createPublicKey({ key: { ...jwk }, format: "jwk" }),
      Buffer.from(firma, "base64url"),
    );
  } catch {
    return false;
  }
}

/** Verifica el `id_token` y devuelve la identidad, o lanza `AUT-0001`. */
export function verificarIdToken(
  token: string,
  { jwks, clienteId, ahora }: DatosVerificacion,
): IdentidadVerificada {
  const partes = token.split(".");
  const [cabeceraCruda, cargaCruda, firmaCruda] = partes;
  if (
    partes.length !== 3 ||
    cabeceraCruda === undefined ||
    cargaCruda === undefined ||
    firmaCruda === undefined
  ) {
    return rechazar("el id_token no tiene tres partes");
  }

  const cabecera = esquemaCabecera.safeParse(leerJson(cabeceraCruda));
  if (!cabecera.success) {
    return rechazar("la cabecera del id_token no tiene alg y kid");
  }
  if (cabecera.data.alg !== "RS256") {
    return rechazar("el alg del id_token no es RS256");
  }
  const clave = jwks.keys.find((jwk) => jwk.kid === cabecera.data.kid);
  if (clave === undefined) {
    return rechazar("el kid del id_token no está en las JWKS de Google");
  }

  if (!firmaVerifica(`${cabeceraCruda}.${cargaCruda}`, firmaCruda, clave)) {
    return rechazar("la firma del id_token no verifica");
  }

  const carga = esquemaCarga.safeParse(leerJson(cargaCruda));
  if (!carga.success) {
    return rechazar("a la carga del id_token le faltan campos");
  }
  const { iss, aud, sub, email, email_verified, exp } = carga.data;
  if (!EMISORES_GOOGLE.has(iss)) {
    return rechazar("el iss del id_token no es Google");
  }
  const audiencias = typeof aud === "string" ? [aud] : aud;
  if (audiencias.length !== 1 || audiencias[0] !== clienteId) {
    return rechazar("el aud del id_token no es GOOGLE_CLIENT_ID");
  }
  if (segundosDesdeEpoca(ahora) >= exp) {
    return rechazar("el id_token está vencido");
  }
  if (email_verified !== true) {
    return rechazar("el email del id_token no está verificado");
  }

  return { proveedor: "google", sub, email, emailVerificado: true };
}
