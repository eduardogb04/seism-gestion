/**
 * `codigoDeError` (F0-31): la app decide a qué pantalla manda un error del
 * login por su código. Next empaqueta un módulo en más de un chunk, y la clase
 * `ErrorSistema` que lanza un caso de uso puede no ser la misma que ve la
 * ruta: `instanceof` falla y un `AUT-0001` termina en un 500. Por eso se
 * reconoce por su forma (nombre y código del catálogo), no por la clase.
 */

import { describe, expect, it } from "vitest";
import { codigoDeError } from "../../src/casos-uso/sesion/errores.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../src/dominio/compartido/errores/error-sistema.ts";

describe("codigoDeError", () => {
  it("devuelve el código de un ErrorSistema", () => {
    expect(codigoDeError(nuevoError(catalogo.AUT_0001, {}))).toBe("AUT-0001");
  });

  it("reconoce un ErrorSistema de otra copia de la clase (otro chunk)", () => {
    const deOtraCopia = Object.assign(new Error("AUT-0002"), {
      name: "ErrorSistema",
      codigo: "AUT-0002",
    });
    expect(codigoDeError(deOtraCopia)).toBe("AUT-0002");
  });

  it("devuelve null para un error cualquiera o un código que no es del catálogo", () => {
    expect(codigoDeError(new Error("AUT-0001"))).toBeNull();
    expect(
      codigoDeError(
        Object.assign(new Error("x"), {
          name: "ErrorSistema",
          codigo: "ZZZ-9999",
        }),
      ),
    ).toBeNull();
    expect(codigoDeError("AUT-0001")).toBeNull();
    expect(codigoDeError(null)).toBeNull();
  });
});
