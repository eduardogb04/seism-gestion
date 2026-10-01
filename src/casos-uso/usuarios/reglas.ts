/**
 * Las reglas que comparten los casos de uso de usuarios (F0-30, ADR 0024):
 * quién puede ejecutarlos, cuándo un administrador es el último, y la forma de
 * un email.
 */

import type { Actor } from "../../dominio/compartido/actor.ts";
import {
  catalogo,
  type EntradaCatalogo,
} from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type { Identificador } from "../../dominio/compartido/identificador.ts";
import type {
  RepositorioUsuarios,
  Rol,
  Usuario,
} from "../../puertos/repositorios/usuarios.ts";

/**
 * Exige que `actor` sea una **persona** con un usuario **activo** (no revocado
 * ni eliminado) cuyo rol esté en `roles`. Si no, lanza `rechazo`: cada permiso
 * tiene su código. Un proceso del sistema no pasa: lo que siembra `db:seed` va
 * por su camino (ADR 0024).
 */
export async function exigirRol(
  usuarios: RepositorioUsuarios,
  actor: Actor,
  roles: readonly Rol[],
  rechazo: EntradaCatalogo,
): Promise<void> {
  const quien =
    actor.tipo === "persona"
      ? await usuarios.buscarPorId(actor.usuarioId)
      : null;
  const puede =
    quien !== null &&
    roles.includes(quien.valor.rol) &&
    quien.valor.estado === "activo" &&
    quien.eliminadoEn === undefined;
  if (!puede) {
    throw nuevoError(rechazo, {
      actor: actor.tipo === "persona" ? actor.usuarioId : actor.proceso,
    });
  }
}

/** `exigirRol` para lo que solo hace un administrador: los usuarios (`AUT-0003`). */
export function exigirAdministrador(
  usuarios: RepositorioUsuarios,
  actor: Actor,
): Promise<void> {
  return exigirRol(usuarios, actor, ["administrador"], catalogo.AUT_0003);
}

/** El usuario con ese id, o `AUT-0006` si no existe. */
export async function exigirUsuario(
  usuarios: RepositorioUsuarios,
  id: Identificador<"Usuario">,
): Promise<Usuario> {
  const usuario = await usuarios.buscarPorId(id);
  if (usuario === null) {
    throw nuevoError(catalogo.AUT_0006, { usuarioId: id });
  }
  return usuario;
}

/**
 * `AUT-0004` si `usuario` es el único de `administradoresActivos`: sacarlo
 * (revocarlo o pasarlo a operador) dejaría el sistema sin administradores.
 * `administradoresActivos` sale de `bloquearAdministradoresActivos`, así dos
 * cambios simultáneos no se pisan.
 */
export function exigirQueNoSeaElUltimoAdministrador(
  usuario: Usuario,
  administradoresActivos: readonly Identificador<"Usuario">[],
): void {
  const esAdministradorActivo = administradoresActivos.includes(
    usuario.valor.id,
  );
  if (esAdministradorActivo && administradoresActivos.length <= 1) {
    throw nuevoError(catalogo.AUT_0004, { usuarioId: usuario.valor.id });
  }
}

/** Un email razonable: algo, una arroba, un dominio con punto; sin espacios. */
const FORMA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * El email como se guarda: sin espacios alrededor y en minúsculas (así no
 * distingue mayúsculas, ADR 0024). Si no tiene forma de email, `AUT-0007`.
 */
export function normalizarEmail(email: string): string {
  const normalizado = email.trim().toLowerCase();
  if (!FORMA_EMAIL.test(normalizado)) {
    throw nuevoError(catalogo.AUT_0007, { largo: email.length });
  }
  return normalizado;
}
