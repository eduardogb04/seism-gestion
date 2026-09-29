/**
 * El armado de la identidad (F0-31): qué adaptador elige según `IDENTIDAD`,
 * qué emails lista el falso, las cookies del login y de la sesión, y la
 * pantalla de un error de login. Nivel dominio: nada sale a la red ni toca la
 * base. Todo inventado.
 */

import { describe, expect, test } from "vitest";
import {
  codificarEstadoLogin,
  leerEstadoLogin,
  opcionesCookieLogin,
  opcionesCookieSesion,
} from "../../src/app/(auth)/cookies.ts";
import { pantallaDeCodigo } from "../../src/casos-uso/sesion/errores.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import {
  EMAILS_INVENTADOS,
  elegirIdentidad,
  generarEstadoLogin,
} from "../../src/infraestructura/arranque/identidad.ts";
import type { Entorno } from "../../src/infraestructura/entorno.ts";

const inicio = crearFechaHora({
  anio: 2031,
  mes: 5,
  dia: 14,
  hora: 10,
  minuto: 0,
  segundo: 0,
  milisegundo: 0,
});
if (!inicio.ok) {
  throw new Error(inicio.mensaje);
}
const RELOJ = RelojFijo(inicio.fechaHora);

const FALSA: Entorno = {
  APP_ENTORNO: "local",
  DATABASE_URL: "postgresql://prueba:prueba@127.0.0.1:5432/prueba",
  ADMIN_INICIAL_EMAIL: "Admin@Ejemplo.test",
  IDENTIDAD: "falsa",
};

const GOOGLE: Entorno = {
  ...FALSA,
  APP_ENTORNO: "servidor",
  IDENTIDAD: "google",
  GOOGLE_CLIENT_ID: "cliente-inventado.apps.ejemplo.test",
  GOOGLE_CLIENT_SECRET: "secreto-inventado",
  APP_URL_PUBLICA: "https://gestion.ejemplo.test",
};

const ESTADO = { state: "s", verificadorPkce: "v" };

describe("elegirIdentidad", () => {
  test("IDENTIDAD=falsa arma el falso, que lista ADMIN_INICIAL_EMAIL y los inventados", () => {
    const { identidad, pruebas } = elegirIdentidad(FALSA, RELOJ);

    expect(identidad.iniciarLogin(ESTADO).startsWith("/ingresar/prueba?")).toBe(
      true,
    );
    expect(pruebas?.emails).toEqual([
      "admin@ejemplo.test",
      ...EMAILS_INVENTADOS,
    ]);
    for (const email of pruebas?.emails ?? []) {
      expect(email.endsWith("@ejemplo.test")).toBe(true);
    }
  });

  test("IDENTIDAD=google arma el de Google, sin pantalla de prueba", () => {
    const { identidad, pruebas } = elegirIdentidad(GOOGLE, RELOJ);

    expect(pruebas).toBeNull();
    expect(
      identidad.iniciarLogin(ESTADO).startsWith("https://accounts.google.com/"),
    ).toBe(true);
  });
});

describe("generarEstadoLogin", () => {
  test("da state y verificador de 256 bits en base64url, distintos cada vez", () => {
    const uno = generarEstadoLogin();
    const otro = generarEstadoLogin();

    expect(uno.state).toMatch(/^[\w-]{43}$/);
    expect(uno.verificadorPkce).toMatch(/^[\w-]{43}$/);
    expect(uno.state).not.toBe(uno.verificadorPkce);
    expect(otro.state).not.toBe(uno.state);
  });
});

describe("las cookies del login y de la sesión (R8)", () => {
  test("la de sesión es httpOnly, Secure, SameSite=Lax, Path=/ y dura 12 horas", () => {
    for (const entorno of ["servidor", "ci"] as const) {
      expect(opcionesCookieSesion(entorno)).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 12 * 60 * 60,
      });
    }
  });

  test("solo con APP_ENTORNO=local va sin Secure (el e2e y next dev corren sobre http://localhost)", () => {
    expect(opcionesCookieSesion("local")).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    });
  });

  test("la temporal del login es httpOnly, dura 10 minutos y solo viaja a /ingresar", () => {
    expect(opcionesCookieLogin("servidor")).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/ingresar",
      maxAge: 600,
    });
    expect(opcionesCookieLogin("local").secure).toBe(false);
  });

  test("el estado del login va y vuelve por la cookie; lo que no se lee es null", () => {
    const estado = generarEstadoLogin();

    expect(leerEstadoLogin(codificarEstadoLogin(estado))).toEqual(estado);
    expect(leerEstadoLogin(undefined)).toBeNull();
    expect(leerEstadoLogin("")).toBeNull();
    expect(leerEstadoLogin("no-es-base64-de-json")).toBeNull();
    expect(
      leerEstadoLogin(Buffer.from('{"state":1}').toString("base64url")),
    ).toBeNull();
  });
});

describe("pantallaDeCodigo", () => {
  test("AUT-0001 se muestra con su código, su descripción y qué hacer", () => {
    expect(pantallaDeCodigo("AUT-0001")).toEqual({
      codigo: "AUT-0001",
      mensaje: expect.stringContaining("No tenés acceso"),
      queHacer: expect.any(String),
    });
  });

  test("un código que no está en el catálogo cae en INF-0001", () => {
    expect(pantallaDeCodigo("XYZ-9999")?.codigo).toBe("INF-0001");
    expect(pantallaDeCodigo(undefined)?.codigo).toBe("INF-0001");
  });
});
