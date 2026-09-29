/**
 * El adaptador de identidad falso (F0-31): la suite de contrato del puerto
 * (`tests/contratos/identidad.ts`) y lo propio del falso —la lista de emails
 * que muestra su pantalla y el código de cada uno—. Nivel dominio: no sale a
 * la red ni toca la base. Emails inventados (`@ejemplo.test`).
 */

import { describe, expect, test } from "vitest";
import {
  crearIdentidadFalsa,
  RUTA_PANTALLA_FALSA,
} from "../../src/adaptadores/identidad-falsa/identidad-falsa.ts";
import { contratoIdentidad } from "../contratos/identidad.ts";

const EMAILS = ["admin@ejemplo.test", "sin-acceso@ejemplo.test"];

contratoIdentidad("identidad-falsa", () => {
  const identidad = crearIdentidadFalsa(EMAILS);
  return {
    identidad,
    codigoValido: () => ({
      codigo: identidad.codigoPara("admin@ejemplo.test"),
      email: "admin@ejemplo.test",
    }),
  };
});

describe("identidad-falsa", () => {
  test("lista los emails de prueba que recibe, en minúsculas y sin repetir", () => {
    const identidad = crearIdentidadFalsa([
      "Admin@Ejemplo.test",
      "admin@ejemplo.test",
      "otra@ejemplo.test",
    ]);

    expect(identidad.emails).toEqual([
      "admin@ejemplo.test",
      "otra@ejemplo.test",
    ]);
  });

  test("iniciarLogin manda a su propia pantalla, no a un proveedor de afuera", () => {
    const identidad = crearIdentidadFalsa(EMAILS);

    const direccion = identidad.iniciarLogin({
      state: "s",
      verificadorPkce: "v",
    });

    expect(direccion.startsWith(`${RUTA_PANTALLA_FALSA}?`)).toBe(true);
  });

  test("un email que no está en su lista no tiene código válido: AUT-0001", async () => {
    const identidad = crearIdentidadFalsa(EMAILS);

    await expect(
      identidad.completarLogin(identidad.codigoPara("intruso@ejemplo.test"), {
        guardado: { state: "s", verificadorPkce: "v" },
        stateRecibido: "s",
      }),
    ).rejects.toMatchObject({ codigo: "AUT-0001" });
  });

  test("verifica la identidad, no la autoriza: un email de la lista sin usuario igual vuelve verificado", async () => {
    const identidad = crearIdentidadFalsa(EMAILS);

    const verificada = await identidad.completarLogin(
      identidad.codigoPara("sin-acceso@ejemplo.test"),
      { guardado: { state: "s", verificadorPkce: "v" }, stateRecibido: "s" },
    );

    expect(verificada).toEqual({
      proveedor: "falsa",
      sub: "falsa:sin-acceso@ejemplo.test",
      email: "sin-acceso@ejemplo.test",
      emailVerificado: true,
    });
  });
});
