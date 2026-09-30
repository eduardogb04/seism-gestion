/**
 * Quién puede entrar a `/administracion/**` y quién actúa (F0-32, ADR 0028).
 * Son decisiones puras sobre la sesión ya validada contra la base
 * (`sesionDesdeCookie`); leer la cookie y redirigir es de la app
 * (`src/app/(auth)/sesion-actual.ts`).
 *
 * - `evaluarAccesoDeAdministrador`: sin sesión → `sin-sesion`; una persona que
 *   no es administradora → `prohibido`, con el `AUT-0003` para mostrar en
 *   pantalla; una administradora → `permitido`, con su `Actor`.
 * - `actorDeSesion`: el `Actor` de una acción de escritura sale **solo** de la
 *   sesión validada; ningún dato del formulario lo aporta (F0-33 lo formaliza
 *   para todo el sistema). Sin sesión, `AUT-0002`: no hay actor anónimo.
 */

import type { Actor } from "../../dominio/compartido/actor.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { type ErrorDeLogin, pantallaDeCodigo } from "./errores.ts";
import type { SesionValida } from "./sesion.ts";

export type Acceso =
  | { readonly tipo: "sin-sesion" }
  | { readonly tipo: "prohibido"; readonly error: ErrorDeLogin }
  | {
      readonly tipo: "permitido";
      readonly sesion: SesionValida;
      readonly actor: Actor;
    };

/** El `Actor` de la persona de la sesión, o `AUT-0002` si no hay sesión. */
export function actorDeSesion(sesion: SesionValida | null): Actor {
  if (sesion === null) {
    throw nuevoError(catalogo.AUT_0002, { motivo: "no hay sesión" });
  }
  return { tipo: "persona", usuarioId: sesion.usuario.id };
}

export function evaluarAccesoDeAdministrador(
  sesion: SesionValida | null,
): Acceso {
  if (sesion === null) {
    return { tipo: "sin-sesion" };
  }
  if (sesion.usuario.rol !== "administrador") {
    return {
      tipo: "prohibido",
      error: pantallaDeCodigo(catalogo.AUT_0003.codigo),
    };
  }
  return { tipo: "permitido", sesion, actor: actorDeSesion(sesion) };
}
