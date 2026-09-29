/**
 * El adaptador de Google (F0-31, R4): la verificación del `id_token` con un
 * par de claves RSA generado **acá**, que firma tokens de prueba. Un caso
 * válido y un test por cada rechazo: firma inválida, `kid` desconocido, `alg`
 * distinto de `RS256`, `iss` ajeno, `aud` ajeno, `exp` vencido (con el reloj
 * inyectado) y `email_verified` que no es `true` (falso, ausente o texto).
 * Todos rechazan con `AUT-0001`.
 *
 * Además, lo que el adaptador hace sin salir a la red: la dirección de
 * `iniciarLogin` (state y PKCE S256) y el rechazo de un `state` que no
 * coincide **antes** de canjear el código. El canje contra Google de verdad
 * se prueba a mano en local (F0-34).
 *
 * Nivel dominio: sin red (el arnés `sin-red` lo garantiza). Todo inventado:
 * cliente, emails, claves.
 */

import {
  generateKeyPairSync,
  type JsonWebKey,
  type KeyObject,
  sign,
} from "node:crypto";
import { describe, expect, test } from "vitest";
import { crearIdentidadGoogle } from "../../src/adaptadores/identidad-google/identidad-google.ts";
import {
  esquemaJwks,
  verificarIdToken,
} from "../../src/adaptadores/identidad-google/verificar-id-token.ts";
import {
  crearFechaHora,
  type FechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";

const CLIENTE = "cliente-inventado.apps.ejemplo.test";
const KID = "clave-de-prueba-1";

function fechaHora(
  anio: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
  segundo: number,
): FechaHora {
  const resultado = crearFechaHora({
    anio,
    mes,
    dia,
    hora,
    minuto,
    segundo,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
}

/** 2031-05-14 11:20:00 en la Argentina (UTC-3) = 14:20:00 UTC. */
const AHORA = fechaHora(2031, 5, 14, 11, 20, 0);
const AHORA_EPOCA = Date.UTC(2031, 4, 14, 14, 20, 0) / 1000;

function parDeClaves(): { privada: KeyObject; publica: JsonWebKey } {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  return { privada: privateKey, publica: publicKey.export({ format: "jwk" }) };
}

const CLAVES = parDeClaves();
const OTRAS_CLAVES = parDeClaves();

/** Pasan por el mismo esquema Zod que las JWKS que baja el adaptador. */
const JWKS = esquemaJwks.parse({
  keys: [{ ...CLAVES.publica, kid: KID, alg: "RS256", use: "sig" }],
});

function base64url(objeto: object): string {
  return Buffer.from(JSON.stringify(objeto)).toString("base64url");
}

const CARGA_VALIDA = {
  iss: "https://accounts.google.com",
  aud: CLIENTE,
  sub: "1234567890",
  email: "Persona@Ejemplo.test",
  email_verified: true,
  iat: AHORA_EPOCA - 60,
  exp: AHORA_EPOCA + 3600,
};

/** Un `id_token` firmado con `privada` (por defecto, la de las JWKS). */
function firmar(
  carga: object,
  {
    cabecera = { alg: "RS256", kid: KID, typ: "JWT" },
    privada = CLAVES.privada,
  }: { cabecera?: object; privada?: KeyObject } = {},
): string {
  const datos = `${base64url(cabecera)}.${base64url(carga)}`;
  const firma = sign("RSA-SHA256", Buffer.from(datos), privada);
  return `${datos}.${firma.toString("base64url")}`;
}

function verificar(token: string) {
  return verificarIdToken(token, {
    jwks: JWKS,
    clienteId: CLIENTE,
    ahora: AHORA,
  });
}

/** El error con que rechaza `token`, o un texto si no rechazó. */
function rechazo(token: string): unknown {
  try {
    verificar(token);
  } catch (error) {
    return error;
  }
  return "no rechazó";
}

/** El rechazo esperado: `AUT-0001`, y por **este** motivo (no por otro control). */
function porMotivo(motivo: string) {
  return {
    codigo: "AUT-0001",
    detalles: { motivo: expect.stringContaining(motivo) },
  };
}

describe("verificarIdToken", () => {
  test("un token válido da la IdentidadVerificada", () => {
    expect(verificar(firmar(CARGA_VALIDA))).toEqual({
      proveedor: "google",
      sub: "1234567890",
      email: "Persona@Ejemplo.test",
      emailVerificado: true,
    });
  });

  test("acepta iss sin esquema (accounts.google.com), que Google también emite", () => {
    const token = firmar({ ...CARGA_VALIDA, iss: "accounts.google.com" });

    expect(verificar(token).sub).toBe("1234567890");
  });

  test("rechaza una firma inválida (firmado con otra clave, mismo kid)", () => {
    const token = firmar(CARGA_VALIDA, { privada: OTRAS_CLAVES.privada });

    expect(rechazo(token)).toMatchObject(porMotivo("firma"));
  });

  test("rechaza una carga alterada después de firmar", () => {
    const [cabecera, , firma] = firmar(CARGA_VALIDA).split(".");
    const alterada = base64url({ ...CARGA_VALIDA, email: "otra@ejemplo.test" });

    expect(rechazo(`${cabecera}.${alterada}.${firma}`)).toMatchObject(
      porMotivo("firma"),
    );
  });

  test("rechaza un kid que no está en las JWKS", () => {
    const token = firmar(CARGA_VALIDA, {
      cabecera: { alg: "RS256", kid: "kid-desconocido", typ: "JWT" },
    });

    expect(rechazo(token)).toMatchObject(porMotivo("kid"));
  });

  test.each(["HS256", "none", "RS512"])(
    "rechaza alg=%s aunque la firma RSA sea buena: solo RS256",
    (alg) => {
      const token = firmar(CARGA_VALIDA, {
        cabecera: { alg, kid: KID, typ: "JWT" },
      });

      expect(rechazo(token)).toMatchObject(porMotivo("alg"));
    },
  );

  test("rechaza un iss que no es Google", () => {
    const token = firmar({ ...CARGA_VALIDA, iss: "https://otro.ejemplo.test" });

    expect(rechazo(token)).toMatchObject(porMotivo("iss"));
  });

  test.each([
    "https://accounts.google.com.ejemplo.test",
    "accounts.google.com.ejemplo.test",
    "https://accounts.google.com/",
    "https://evil.ejemplo.test/accounts.google.com",
  ])("rechaza un iss que se parece al de Google pero no lo es (%s)", (iss) => {
    const token = firmar({ ...CARGA_VALIDA, iss });

    expect(rechazo(token)).toMatchObject(porMotivo("iss"));
  });

  test("rechaza un aud que no es GOOGLE_CLIENT_ID", () => {
    const token = firmar({ ...CARGA_VALIDA, aud: "otro-cliente.ejemplo.test" });

    expect(rechazo(token)).toMatchObject(porMotivo("aud"));
  });

  test("rechaza un exp vencido según el reloj inyectado (y el exp justo ahora)", () => {
    const vencido = firmar({ ...CARGA_VALIDA, exp: AHORA_EPOCA - 1 });
    const justo = firmar({ ...CARGA_VALIDA, exp: AHORA_EPOCA });

    expect(rechazo(vencido)).toMatchObject(porMotivo("vencido"));
    expect(rechazo(justo)).toMatchObject(porMotivo("vencido"));
  });

  test("el mismo token vale con un reloj anterior al exp: el vencimiento sale del reloj", () => {
    const token = firmar({ ...CARGA_VALIDA, exp: AHORA_EPOCA - 1 });

    const verificada = verificarIdToken(token, {
      jwks: JWKS,
      clienteId: CLIENTE,
      ahora: fechaHora(2031, 5, 14, 11, 19, 0),
    });

    expect(verificada.sub).toBe("1234567890");
  });

  test.each([
    ["false", false],
    ["el texto true", "true"],
    ["ausente", undefined],
  ])("rechaza email_verified %s: solo vale true", (_nombre, valor) => {
    const token = firmar({ ...CARGA_VALIDA, email_verified: valor });

    expect(rechazo(token)).toMatchObject(porMotivo("no está verificado"));
  });

  test.each(["", "a.b", "no-es-un-jwt", "a.b.c.d"])(
    "rechaza un token mal formado (%j)",
    (token) => {
      expect(rechazo(token)).toMatchObject({ codigo: "AUT-0001" });
    },
  );

  test("el error no lleva el token en los detalles", () => {
    const token = firmar({ ...CARGA_VALIDA, aud: "otro-cliente.ejemplo.test" });
    const carga = token.split(".")[1] ?? "";

    const error = rechazo(token);

    expect(error).toMatchObject({ codigo: "AUT-0001" });
    expect(JSON.stringify(error)).not.toContain(carga);
  });
});

describe("crearIdentidadGoogle, sin salir a la red", () => {
  const identidad = crearIdentidadGoogle({
    clienteId: CLIENTE,
    secreto: "secreto-inventado",
    urlPublica: "https://gestion.ejemplo.test",
    reloj: RelojFijo(AHORA),
  });
  const ESTADO = {
    state: "estado-de-prueba",
    verificadorPkce: "verificador-de-prueba-000000000000000000000",
  };

  test("iniciarLogin arma la dirección de Google con state, PKCE S256, openid y email", () => {
    const url = new URL(identidad.iniciarLogin(ESTADO));

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("state")).toBe(ESTADO.state);
    expect(url.searchParams.get("client_id")).toBe(CLIENTE);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://gestion.ejemplo.test/ingresar/callback",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining(["openid", "email"]),
    );
  });

  test("completarLogin rechaza un state que no coincide con AUT-0002, sin canjear el código", async () => {
    await expect(
      identidad.completarLogin("codigo", {
        guardado: ESTADO,
        stateRecibido: "otro",
      }),
    ).rejects.toMatchObject({ codigo: "AUT-0002" });
  });
});
