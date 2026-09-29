/**
 * Lo que llega de los formularios de `/administracion/usuarios` se valida con
 * Zod en el servidor (F0-32, R5), antes de tocar ningún caso de uso:
 *
 * - el rol tiene que ser uno de `ROLES` (un selector no es garantía: el POST se
 *   puede armar a mano); uno inventado, vacío o que no es texto es `AUT-0008`;
 * - el id del usuario tiene que ser un UUID; si no, `AUT-0008`;
 * - el email tiene que llegar como texto (su forma y las minúsculas las
 *   resuelve `darDeAlta`, `AUT-0007`): un archivo o nada, `AUT-0008`.
 *
 * Datos inventados (`@ejemplo.test`).
 */

import { describe, expect, test } from "vitest";
import {
  datosDeAlta,
  datosDeCambioDeRol,
  datosDeUsuario,
} from "../../src/casos-uso/usuarios/formularios.ts";
import { ETIQUETAS_ROL, ROLES } from "../../src/casos-uso/usuarios/roles.ts";

const ID = "22222222-2222-4222-8222-222222222222";

function codigoAlFallar(trabajo: () => unknown): string | undefined {
  try {
    trabajo();
  } catch (error) {
    return (error as { codigo?: string }).codigo;
  }
  return undefined;
}

describe("los roles", () => {
  test("ROLES y sus etiquetas son los mismos: un rol nuevo no queda sin nombre", () => {
    expect([...ROLES].sort()).toEqual(Object.keys(ETIQUETAS_ROL).sort());
    expect(ROLES).toEqual(["administrador", "operador"]);
  });
});

describe("datosDeAlta", () => {
  test("email y rol válidos pasan, el email tal como llegó", () => {
    expect(
      datosDeAlta({ email: " Operadora@Ejemplo.TEST ", rol: "operador" }),
    ).toEqual({ email: " Operadora@Ejemplo.TEST ", rol: "operador" });
  });

  test.each([
    ["un rol inventado", "superadministrador"],
    ["un rol con otras mayúsculas", "Administrador"],
    ["un rol vacío", ""],
    ["sin rol", null],
    ["un rol que no es texto", 7],
    ["una propiedad heredada", "constructor"],
  ])("%s es AUT-0008", (_caso, rol) => {
    expect(
      codigoAlFallar(() => datosDeAlta({ email: "a@ejemplo.test", rol })),
    ).toBe("AUT-0008");
  });

  test.each([
    ["sin email", null],
    ["un email que no es texto", new Blob(["x"])],
  ])("%s es AUT-0008", (_caso, email) => {
    expect(codigoAlFallar(() => datosDeAlta({ email, rol: "operador" }))).toBe(
      "AUT-0008",
    );
  });
});

describe("datosDeUsuario", () => {
  test("un UUID pasa", () => {
    expect(datosDeUsuario({ usuarioId: ID })).toBe(ID);
  });

  test.each([
    ["algo que no es un UUID", "no-es-un-id"],
    ["vacío", ""],
    ["nada", null],
  ])("%s es AUT-0008", (_caso, usuarioId) => {
    expect(codigoAlFallar(() => datosDeUsuario({ usuarioId }))).toBe(
      "AUT-0008",
    );
  });
});

describe("datosDeCambioDeRol", () => {
  test("usuario y rol válidos pasan", () => {
    expect(datosDeCambioDeRol({ usuarioId: ID, rol: "administrador" })).toEqual(
      { usuarioId: ID, rol: "administrador" },
    );
  });

  test("un rol inventado es AUT-0008", () => {
    expect(
      codigoAlFallar(() => datosDeCambioDeRol({ usuarioId: ID, rol: "dueño" })),
    ).toBe("AUT-0008");
  });

  test("un id que no es UUID es AUT-0008", () => {
    expect(
      codigoAlFallar(() =>
        datosDeCambioDeRol({
          usuarioId: "1; drop table usuarios",
          rol: "operador",
        }),
      ),
    ).toBe("AUT-0008");
  });
});
