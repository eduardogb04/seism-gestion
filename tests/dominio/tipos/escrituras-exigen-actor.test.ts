/**
 * F0-33: escribir exige identidad, **por tipos**. Cada caso de uso de
 * escritura y cada método de escritura de un repositorio de entidades recibe
 * un `Actor` como primer parámetro obligatorio; llamarlo sin actor **no
 * compila**.
 *
 * Lo verifica `npm run typecheck` (el `tsconfig` incluye `tests/**`): cada
 * llamada sin actor lleva un `@ts-expect-error`, y un `@ts-expect-error` que
 * no tapa ningún error es él mismo un error (`Unused '@ts-expect-error'
 * directive`). Si alguien le quita el `actor` a una firma, la llamada de acá
 * pasa a compilar y `typecheck` se pone en rojo.
 *
 * Las funciones de abajo **nunca se ejecutan**: solo existen para que el
 * compilador las mire. El `test()` del final solo evita que Vitest se queje
 * de un archivo sin tests.
 *
 * Cada llamada va en una sola línea: `@ts-expect-error` solo tapa la línea
 * que le sigue.
 *
 * No entra `RepositorioSesiones`: una sesión es una credencial, no un dato de
 * negocio (ADR 0024 y 0029).
 */

import { expect, test } from "vitest";
import type { CasosUsoUsuarios } from "../../../src/casos-uso/usuarios/usuarios.ts";
import type { Identificador } from "../../../src/dominio/compartido/identificador.ts";
import type {
  RepositorioUsuarios,
  Usuario,
} from "../../../src/puertos/repositorios/usuarios.ts";

declare const casos: CasosUsoUsuarios;
declare const repositorio: RepositorioUsuarios;
declare const usuario: Usuario;
declare const usuarioId: Identificador<"Usuario">;

function casosDeUsoSinActor(): void {
  // @ts-expect-error `darDeAlta` exige un `Actor` primero.
  casos.darDeAlta("alguien@ejemplo.test", "operador");
  // @ts-expect-error `revocar` exige un `Actor` primero.
  casos.revocar(usuarioId);
  // @ts-expect-error `cambiarRol` exige un `Actor` primero.
  casos.cambiarRol(usuarioId, "operador");
}

function repositoriosSinActor(): void {
  // @ts-expect-error `crear` exige un `Actor` primero.
  repositorio.crear(usuario);
  // @ts-expect-error `actualizar` exige un `Actor` primero.
  repositorio.actualizar(usuario, "actualizar");
}

test("las llamadas sin actor no compilan (lo verifica `npm run typecheck`)", () => {
  expect(casosDeUsoSinActor).toBeTypeOf("function");
  expect(repositoriosSinActor).toBeTypeOf("function");
});
