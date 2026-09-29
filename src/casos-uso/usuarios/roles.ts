/**
 * Los roles que existen (F0-32), con el nombre que ve la persona en el
 * selector de la pantalla. `Rol` (el tipo) vive en el puerto; acá está el
 * valor, porque la app no puede leer del dominio más que tipos. Un rol nuevo
 * se suma en los tres lugares y `tests/dominio/formularios-usuarios.test.ts`
 * avisa si uno queda sin nombre.
 */

import type { Rol } from "../../puertos/repositorios/usuarios.ts";

/** Todos los roles, en el orden en que se ofrecen. */
export const ROLES = ["administrador", "operador"] as const satisfies readonly [
  Rol,
  ...Rol[],
];

/** El nombre de cada rol en pantalla. Un `Record` no compila si falta un rol. */
export const ETIQUETAS_ROL: Readonly<Record<Rol, string>> = {
  administrador: "Administrador",
  operador: "Operador",
};
