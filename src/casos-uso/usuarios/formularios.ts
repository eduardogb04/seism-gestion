/**
 * Lo que llega de los formularios de `/administracion/usuarios` (F0-32, R5):
 * viene de afuera —un POST se puede armar a mano, el `<select>` no es una
 * garantía— y se valida con Zod en el servidor antes de llegar a un caso de
 * uso. Lo que no cumple es `AUT-0008`.
 *
 * El email solo se comprueba que sea texto: su forma, las minúsculas y los
 * espacios los resuelve `darDeAlta` (`AUT-0007`), una sola vez y en un solo
 * lugar. El actor **no** está acá: sale de la sesión (`actorDeSesion`).
 */

import { z } from "zod";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import {
  type Identificador,
  identificadorDesde,
} from "../../dominio/compartido/identificador.ts";
import type { Rol } from "../../puertos/repositorios/usuarios.ts";
import { ROLES } from "./roles.ts";

/** El largo máximo de un email (RFC 5321): más que eso no es un email. */
const LARGO_MAXIMO_EMAIL = 254;

const esquemaRol = z.enum(ROLES);
const esquemaEmail = z.string().max(LARGO_MAXIMO_EMAIL);
const esquemaUsuarioId = z.uuid();

function leer<T>(esquema: z.ZodType<T>, valor: unknown, campo: string): T {
  const leido = esquema.safeParse(valor);
  if (!leido.success) {
    throw nuevoError(catalogo.AUT_0008, { campo });
  }
  return leido.data;
}

export function datosDeAlta(entrada: {
  readonly email: unknown;
  readonly rol: unknown;
}): { readonly email: string; readonly rol: Rol } {
  return {
    email: leer(esquemaEmail, entrada.email, "email"),
    rol: leer(esquemaRol, entrada.rol, "rol"),
  };
}

/** El id del usuario sobre el que se actúa (revocar). */
export function datosDeUsuario(entrada: {
  readonly usuarioId: unknown;
}): Identificador<"Usuario"> {
  return identificadorDesde<"Usuario">(
    leer(esquemaUsuarioId, entrada.usuarioId, "usuarioId"),
  );
}

export function datosDeCambioDeRol(entrada: {
  readonly usuarioId: unknown;
  readonly rol: unknown;
}): { readonly usuarioId: Identificador<"Usuario">; readonly rol: Rol } {
  return {
    usuarioId: datosDeUsuario(entrada),
    rol: leer(esquemaRol, entrada.rol, "rol"),
  };
}
