/**
 * Suite de contrato del puerto de identidad (F0-31, R5): lo que cualquier
 * adaptador de `Identidad` (`src/puertos/identidad.ts`) tiene que cumplir.
 * Corre contra el falso (`tests/dominio/identidad-falsa.test.ts`); el de
 * Google se prueba a mano en local (F0-34) y su verificación del `id_token`
 * con un test unitario propio (`tests/dominio/identidad-google.test.ts`),
 * porque hablar con Google de verdad no entra en ningún nivel automático.
 *
 * - `iniciarLogin` devuelve adónde mandar al navegador, y esa dirección lleva
 *   el `state` que se le pasó.
 * - `completarLogin` con un `state` que no es el guardado → `AUT-0002`, aunque
 *   el código sea válido.
 * - `completarLogin` con un código que el proveedor no reconoce → `AUT-0001`.
 * - El camino feliz → una `IdentidadVerificada` con `emailVerificado: true`.
 *
 * No es un `*.test.ts`: no lo toma ningún proyecto de Vitest solo; lo llama
 * el test de cada adaptador con su armado.
 */

import { describe, expect, test } from "vitest";
import type { EstadoLogin, Identidad } from "../../src/puertos/identidad.ts";

export type ArmadoContratoIdentidad = {
  readonly identidad: Identidad;
  /** Un código que el proveedor acepta, y el email que tiene que devolver. */
  readonly codigoValido: () => {
    readonly codigo: string;
    readonly email: string;
  };
};

/** Un `state` y un verificador PKCE inventados (43 caracteres, como los de verdad). */
const ESTADO: EstadoLogin = {
  state: "estado-de-prueba-000000000000000000000000000",
  verificadorPkce: "verificador-de-prueba-000000000000000000000",
};

export function contratoIdentidad(
  nombre: string,
  armar: () => ArmadoContratoIdentidad,
): void {
  describe(`contrato de Identidad: ${nombre}`, () => {
    test("iniciarLogin devuelve una dirección que lleva el state", () => {
      const { identidad } = armar();

      const direccion = identidad.iniciarLogin(ESTADO);

      expect(direccion).not.toBe("");
      const url = new URL(direccion, "http://base.ejemplo.test");
      expect(url.searchParams.get("state")).toBe(ESTADO.state);
    });

    test("completarLogin con un state que no es el guardado rechaza con AUT-0002", async () => {
      const { identidad, codigoValido } = armar();

      await expect(
        identidad.completarLogin(codigoValido().codigo, {
          guardado: ESTADO,
          stateRecibido: "otro-estado",
        }),
      ).rejects.toMatchObject({ codigo: "AUT-0002" });
    });

    test("completarLogin sin state recibido rechaza con AUT-0002", async () => {
      const { identidad, codigoValido } = armar();

      await expect(
        identidad.completarLogin(codigoValido().codigo, {
          guardado: ESTADO,
          stateRecibido: null,
        }),
      ).rejects.toMatchObject({ codigo: "AUT-0002" });
    });

    test("completarLogin con un código desconocido rechaza con AUT-0001", async () => {
      const { identidad } = armar();

      await expect(
        identidad.completarLogin("codigo-que-nadie-emitio", {
          guardado: ESTADO,
          stateRecibido: ESTADO.state,
        }),
      ).rejects.toMatchObject({ codigo: "AUT-0001" });
    });

    test("camino feliz: devuelve la IdentidadVerificada con emailVerificado true", async () => {
      const { identidad, codigoValido } = armar();
      const { codigo, email } = codigoValido();

      const verificada = await identidad.completarLogin(codigo, {
        guardado: ESTADO,
        stateRecibido: ESTADO.state,
      });

      expect(verificada).toEqual({
        proveedor: expect.any(String),
        sub: expect.stringMatching(/.+/),
        email,
        emailVerificado: true,
      });
    });
  });
}
