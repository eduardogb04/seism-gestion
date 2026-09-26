/**
 * `RepositorioUsuarios` con Prisma (F0-30, ADR 0024). Recibe un cliente o el
 * cliente de una transacción en curso (`transaccion.ts`): así cada operación
 * entra en la transacción de quien la llama.
 *
 * El email se pasa a minúsculas al escribir y al buscar; la base lo exige
 * igual (índice único y CHECK `usuarios_email_en_minusculas`). Un email
 * repetido, aun con otras mayúsculas, es `AUT-0005`.
 */

import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../../dominio/compartido/identificador.ts";
import type {
  RepositorioUsuarios,
  Usuario,
} from "../../puertos/repositorios/usuarios.ts";
import {
  actorAJson,
  actorDesdeJson,
  aFechaHora,
  aInstante,
} from "./conversiones.ts";
import { type Usuario as FilaUsuario, Prisma } from "./generado/client.ts";

/** Código de Prisma para una violación de índice único. */
const VIOLACION_UNICO = "P2002";

function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

function desdeFila(fila: FilaUsuario): Usuario {
  const usuario: Usuario = {
    valor: {
      id: identificadorDesde<"Usuario">(fila.id),
      email: fila.email,
      nombre: fila.nombre,
      rol: fila.rol,
      estado: fila.estado,
    },
    creadoEn: aFechaHora(fila.creadoEn),
    creadoPor: actorDesdeJson(fila.creadoPor),
    actualizadoEn: aFechaHora(fila.actualizadoEn),
    actualizadoPor: actorDesdeJson(fila.actualizadoPor),
  };
  if (fila.eliminadoEn === null || fila.eliminadoPor === null) {
    return usuario;
  }
  return {
    ...usuario,
    eliminadoEn: aFechaHora(fila.eliminadoEn),
    eliminadoPor: actorDesdeJson(fila.eliminadoPor),
  };
}

function aFila(usuario: Usuario) {
  return {
    email: normalizarEmail(usuario.valor.email),
    nombre: usuario.valor.nombre,
    rol: usuario.valor.rol,
    estado: usuario.valor.estado,
    creadoEn: aInstante(usuario.creadoEn),
    creadoPor: actorAJson(usuario.creadoPor),
    actualizadoEn: aInstante(usuario.actualizadoEn),
    actualizadoPor: actorAJson(usuario.actualizadoPor),
    eliminadoEn:
      usuario.eliminadoEn === undefined ? null : aInstante(usuario.eliminadoEn),
    eliminadoPor:
      usuario.eliminadoPor === undefined
        ? Prisma.DbNull
        : actorAJson(usuario.eliminadoPor),
  };
}

/** Un `RepositorioUsuarios` sobre `cliente` (o sobre la transacción que lo contiene). */
export function crearRepositorioUsuariosPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioUsuarios {
  return {
    async buscarPorId(id) {
      const fila = await cliente.usuario.findUnique({ where: { id } });
      return fila === null ? null : desdeFila(fila);
    },

    async buscarPorEmail(email) {
      const fila = await cliente.usuario.findUnique({
        where: { email: normalizarEmail(email) },
      });
      return fila === null ? null : desdeFila(fila);
    },

    async crear(usuario) {
      try {
        await cliente.usuario.create({
          data: { id: usuario.valor.id, ...aFila(usuario) },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === VIOLACION_UNICO
        ) {
          throw nuevoError(
            catalogo.AUT_0005,
            { usuarioId: usuario.valor.id },
            error,
          );
        }
        throw error;
      }
    },

    async actualizar(usuario) {
      await cliente.usuario.update({
        where: { id: usuario.valor.id },
        data: aFila(usuario),
      });
    },

    async bloquearAdministradoresActivos() {
      const filas = await cliente.$queryRaw<{ id: string }[]>`
        select id::text as id
          from usuarios
         where rol = 'administrador'
           and estado = 'activo'
           and eliminado_en is null
         order by id
           for update`;
      return filas.map(({ id }) => identificadorDesde<"Usuario">(id));
    },
  };
}
