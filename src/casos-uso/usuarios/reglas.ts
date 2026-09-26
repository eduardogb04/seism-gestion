/**
 * Las reglas que comparten los casos de uso de usuarios (F0-30, ADR 0024):
 * quién puede ejecutarlos, cuándo un administrador es el último, la forma de
 * un email y el registro de auditoría de cada cambio.
 */

import type { Actor } from "../../dominio/compartido/actor.ts";
import type { RegistroAuditoria } from "../../dominio/compartido/auditable.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type { Identificador } from "../../dominio/compartido/identificador.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import type {
  RepositorioUsuarios,
  Usuario,
} from "../../puertos/repositorios/usuarios.ts";

/**
 * Exige que `actor` sea una **persona** con un usuario **administrador** y
 * **activo** (no revocado ni eliminado). Si no, `AUT-0003`. Un proceso del
 * sistema no administra usuarios: el primer administrador lo crea `db:seed`
 * por su cuenta (ADR 0024).
 */
export async function exigirAdministrador(
  usuarios: RepositorioUsuarios,
  actor: Actor,
): Promise<void> {
  const quien =
    actor.tipo === "persona"
      ? await usuarios.buscarPorId(actor.usuarioId)
      : null;
  const esAdministradorActivo =
    quien !== null &&
    quien.valor.rol === "administrador" &&
    quien.valor.estado === "activo" &&
    quien.eliminadoEn === undefined;
  if (!esAdministradorActivo) {
    throw nuevoError(catalogo.AUT_0003, {
      actor: actor.tipo === "persona" ? actor.usuarioId : actor.proceso,
    });
  }
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

/** Lo que la auditoría guarda de un usuario en `antes` y `despues`. */
function foto(usuario: Usuario): Readonly<Record<string, unknown>> {
  return {
    id: usuario.valor.id,
    email: usuario.valor.email,
    nombre: usuario.valor.nombre,
    rol: usuario.valor.rol,
    estado: usuario.valor.estado,
  };
}

/**
 * El `RegistroAuditoria` de un cambio de usuario. Sin `antes` es un alta
 * (`crear`); con `antes`, un cambio (`actualizar`): revocar no es un borrado
 * (el usuario sigue guardado, con `estado: "revocado"`).
 */
export function registroDeUsuario(
  antes: Usuario | null,
  despues: Usuario,
  actor: Actor,
  reloj: Reloj,
): RegistroAuditoria {
  return {
    entidad: "Usuario",
    id: despues.valor.id,
    accion: antes === null ? "crear" : "actualizar",
    antes: antes === null ? null : foto(antes),
    despues: foto(despues),
    actor,
    en: reloj.ahora(),
  };
}
