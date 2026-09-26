/**
 * Casos de uso de usuarios (F0-30, ADR 0024): `darDeAlta`, `revocar` y
 * `cambiarRol`. Los tres:
 *
 * - reciben un `Actor` obligatorio (F0-22) y solo los ejecuta una persona
 *   **administradora y activa** (`AUT-0003` si no);
 * - corren **enteros en una transacción** (`Transaccional`): el cambio del
 *   usuario, el cierre de sus sesiones y el registro de auditoría quedan
 *   todos o ninguno;
 * - escriben un `RegistroAuditoria` con `antes` y `despues`, con la fecha del
 *   reloj inyectado.
 *
 * `revocar` y `cambiarRol` bloquean primero a los administradores activos:
 * nunca dejan el sistema sin uno (`AUT-0004`), tampoco con dos cambios al
 * mismo tiempo.
 */

import type { Actor } from "../../dominio/compartido/actor.ts";
import {
  crearAuditable,
  marcarActualizado,
} from "../../dominio/compartido/auditable.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import {
  type Identificador,
  identificadorDesde,
} from "../../dominio/compartido/identificador.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import type { GeneradorId } from "../../puertos/generador-id.ts";
import type {
  RepositoriosEnTransaccion,
  Transaccional,
} from "../../puertos/repositorios/transaccion.ts";
import type {
  DatosUsuario,
  Rol,
  Usuario,
} from "../../puertos/repositorios/usuarios.ts";
import {
  exigirAdministrador,
  exigirQueNoSeaElUltimoAdministrador,
  exigirUsuario,
  normalizarEmail,
  registroDeUsuario,
} from "./reglas.ts";

export type DependenciasUsuarios = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
  readonly generadorId: GeneradorId;
};

export type CasosUsoUsuarios = {
  /** Da de alta un usuario activo. `AUT-0005` si el email ya existe; `AUT-0007` si no es un email. */
  darDeAlta(actor: Actor, email: string, rol: Rol): Promise<Usuario>;
  /**
   * Revoca al usuario y cierra todas sus sesiones. Si ya estaba revocado, no
   * cambia nada. `AUT-0006` si no existe.
   */
  revocar(actor: Actor, usuarioId: Identificador<"Usuario">): Promise<Usuario>;
  /** Cambia el rol. Al mismo rol, no cambia nada. `AUT-0006` si no existe. */
  cambiarRol(
    actor: Actor,
    usuarioId: Identificador<"Usuario">,
    rol: Rol,
  ): Promise<Usuario>;
};

export function crearCasosUsoUsuarios({
  transaccional,
  reloj,
  generadorId,
}: DependenciasUsuarios): CasosUsoUsuarios {
  /** Aplica `cambios`, guarda y audita. */
  async function actualizar(
    repos: RepositoriosEnTransaccion,
    actor: Actor,
    usuario: Usuario,
    cambios: Partial<DatosUsuario>,
  ): Promise<Usuario> {
    const actualizado = marcarActualizado(
      usuario,
      { ...usuario.valor, ...cambios },
      actor,
      reloj,
    );
    if (!actualizado.ok) {
      throw nuevoError(catalogo.DOM_0007, { usuarioId: usuario.valor.id });
    }
    await repos.usuarios.actualizar(actualizado.valor);
    if (cambios.estado === "revocado") {
      await repos.sesiones.cerrarTodasDe(usuario.valor.id);
    }
    await repos.auditoria.registrar(
      registroDeUsuario(usuario, actualizado.valor, actor, reloj),
    );
    return actualizado.valor;
  }

  return {
    darDeAlta(actor, email, rol) {
      return transaccional.ejecutar(async (repos) => {
        await exigirAdministrador(repos.usuarios, actor);
        const normalizado = normalizarEmail(email);
        if ((await repos.usuarios.buscarPorEmail(normalizado)) !== null) {
          throw nuevoError(catalogo.AUT_0005, {});
        }
        const usuario = crearAuditable<DatosUsuario>(
          {
            id: identificadorDesde<"Usuario">(generadorId.generar()),
            email: normalizado,
            nombre: null,
            rol,
            estado: "activo",
          },
          actor,
          reloj,
        );
        await repos.usuarios.crear(usuario);
        await repos.auditoria.registrar(
          registroDeUsuario(null, usuario, actor, reloj),
        );
        return usuario;
      });
    },

    revocar(actor, usuarioId) {
      return transaccional.ejecutar(async (repos) => {
        const administradores =
          await repos.usuarios.bloquearAdministradoresActivos();
        await exigirAdministrador(repos.usuarios, actor);
        const usuario = await exigirUsuario(repos.usuarios, usuarioId);
        if (usuario.valor.estado === "revocado") {
          return usuario;
        }
        exigirQueNoSeaElUltimoAdministrador(usuario, administradores);
        return actualizar(repos, actor, usuario, { estado: "revocado" });
      });
    },

    cambiarRol(actor, usuarioId, rol) {
      return transaccional.ejecutar(async (repos) => {
        const administradores =
          await repos.usuarios.bloquearAdministradoresActivos();
        await exigirAdministrador(repos.usuarios, actor);
        const usuario = await exigirUsuario(repos.usuarios, usuarioId);
        if (usuario.valor.rol === rol) {
          return usuario;
        }
        if (rol === "operador") {
          exigirQueNoSeaElUltimoAdministrador(usuario, administradores);
        }
        return actualizar(repos, actor, usuario, { rol });
      });
    },
  };
}
