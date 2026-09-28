/**
 * F0-31, R6: la identidad falsa **no arranca** en el servidor. El esquema lo
 * prueba `tests/dominio/entorno.test.ts`; acá se ve en un proceso de verdad:
 * se corre el `register` de `src/instrumentation.ts` —lo que Next llama al
 * levantar el servidor— con `APP_ENTORNO=servidor` e `IDENTIDAD=falsa`, y el
 * proceso tiene que terminar con código 1 nombrando la variable. Con
 * `IDENTIDAD=google` y sus variables, el mismo arranque sigue de largo.
 *
 * Va en el nivel casos de uso porque levanta un proceso (el nivel dominio no
 * sale de su propio proceso). Datos inventados.
 */

import { spawnSync } from "node:child_process";
import process from "node:process";
import { describe, expect, test } from "vitest";

/** Lo que Next hace al arrancar: importar `instrumentation.ts` y llamar a `register`. */
const ARRANQUE = [
  "--input-type=module",
  "--eval",
  'const { register } = await import("./src/instrumentation.ts"); await register(); process.stdout.write("arrancó");',
];

/** Un entorno de servidor completo con Google (credenciales inventadas). */
const SERVIDOR_CON_GOOGLE = {
  NEXT_RUNTIME: "nodejs",
  APP_ENTORNO: "servidor",
  DATABASE_URL: "postgresql://prueba:prueba@127.0.0.1:5432/prueba",
  ADMIN_INICIAL_EMAIL: "admin@ejemplo.test",
  IDENTIDAD: "google",
  GOOGLE_CLIENT_ID: "cliente-inventado.apps.ejemplo.test",
  GOOGLE_CLIENT_SECRET: "secreto-inventado",
  APP_URL_PUBLICA: "https://gestion.ejemplo.test",
};

function arrancar(variables: Readonly<Record<string, string>>) {
  const resultado = spawnSync(process.execPath, ARRANQUE, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      NODE_ENV: "production",
      PATH: process.env.PATH ?? "",
      SystemRoot: process.env.SystemRoot ?? "",
      ...variables,
    },
    timeout: 60_000,
  });
  return {
    codigo: resultado.status,
    salida: resultado.stdout,
    errores: resultado.stderr,
  };
}

describe("el arranque de la app con la identidad falsa (F0-31)", () => {
  test("con APP_ENTORNO=servidor e IDENTIDAD=falsa la app no arranca: sale 1 y nombra IDENTIDAD", () => {
    const { codigo, salida, errores } = arrancar({
      ...SERVIDOR_CON_GOOGLE,
      IDENTIDAD: "falsa",
    });

    expect(codigo).toBe(1);
    expect(salida).not.toContain("arrancó");
    expect(errores).toContain("la app no arranca");
    expect(errores).toContain("- IDENTIDAD:");
    expect(errores).toContain("APP_ENTORNO=servidor");
  });

  test("con APP_ENTORNO=servidor e IDENTIDAD=google (y sus variables) arranca", () => {
    const { codigo, salida, errores } = arrancar(SERVIDOR_CON_GOOGLE);

    expect(errores).toBe("");
    expect(codigo).toBe(0);
    expect(salida).toContain("arrancó");
  });

  test("con IDENTIDAD=falsa fuera del servidor (APP_ENTORNO=local) arranca", () => {
    const { codigo, salida } = arrancar({
      ...SERVIDOR_CON_GOOGLE,
      APP_ENTORNO: "local",
      IDENTIDAD: "falsa",
    });

    expect(codigo).toBe(0);
    expect(salida).toContain("arrancó");
  });
});
