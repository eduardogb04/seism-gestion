/**
 * Quién entra a `/administracion/**` y quién actúa (F0-32, R2, R4). Son las dos
 * decisiones puras que usa la app; la lectura de la cookie y la redirección
 * son de Next y están en `src/app/(auth)/sesion-actual.ts`.
 *
 * - `evaluarAccesoDeAdministrador`: sin sesión → `sin-sesion`; con sesión de un
 *   operador → `prohibido` con el `AUT-0003` del catálogo; con sesión de un
 *   administrador → `permitido`.
 * - `actorDeSesion`: el `Actor` sale **solo** de la sesión validada (nunca de
 *   un dato del formulario); sin sesión, `AUT-0002`.
 *
 * Datos inventados (`@ejemplo.test`).
 */

import { describe, expect, test } from "vitest";
import {
  actorDeSesion,
  evaluarAccesoDeAdministrador,
} from "../../src/casos-uso/sesion/acceso.ts";
import type { SesionValida } from "../../src/casos-uso/sesion/sesion.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import { identificadorDesde } from "../../src/dominio/compartido/identificador.ts";
import { crearFechaHora } from "../../src/dominio/compartido/reloj.ts";
import type { Rol } from "../../src/puertos/repositorios/usuarios.ts";

function sesionDe(rol: Rol): SesionValida {
  const expira = crearFechaHora({
    anio: 2031,
    mes: 5,
    dia: 14,
    hora: 22,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!expira.ok) {
    throw new Error(expira.mensaje);
  }
  return {
    sesionId: "sesion-inventada",
    expiraEn: expira.fechaHora,
    usuario: {
      id: identificadorDesde<"Usuario">("11111111-1111-4111-8111-111111111111"),
      email: `${rol}@ejemplo.test`,
      nombre: null,
      rol,
    },
  };
}

describe("evaluarAccesoDeAdministrador", () => {
  test("sin sesión: sin-sesion", () => {
    expect(evaluarAccesoDeAdministrador(null)).toEqual({ tipo: "sin-sesion" });
  });

  test("un operador con sesión válida: prohibido, con el AUT-0003 del catálogo", () => {
    expect(evaluarAccesoDeAdministrador(sesionDe("operador"))).toEqual({
      tipo: "prohibido",
      error: {
        codigo: "AUT-0003",
        mensaje: catalogo.AUT_0003.descripcion,
        queHacer: catalogo.AUT_0003.queHacer,
      },
    });
  });

  test("un administrador: permitido, con la sesión y el actor de esa persona", () => {
    const sesion = sesionDe("administrador");

    expect(evaluarAccesoDeAdministrador(sesion)).toEqual({
      tipo: "permitido",
      sesion,
      actor: { tipo: "persona", usuarioId: sesion.usuario.id },
    });
  });
});

describe("actorDeSesion", () => {
  test("es la persona de la sesión, sea cual sea su rol", () => {
    for (const rol of ["administrador", "operador"] as const) {
      const sesion = sesionDe(rol);

      expect(actorDeSesion(sesion)).toEqual({
        tipo: "persona",
        usuarioId: sesion.usuario.id,
      });
    }
  });

  test("sin sesión es AUT-0002: no hay actor anónimo", () => {
    expect(() => actorDeSesion(null)).toThrowError(
      expect.objectContaining({ codigo: "AUT-0002" }),
    );
  });
});
