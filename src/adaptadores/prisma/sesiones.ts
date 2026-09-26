/**
 * `RepositorioSesiones` con Prisma (F0-30, ADR 0024). El `id` de cada sesión
 * es el token: 32 bytes (256 bits) de `randomBytes` de `node:crypto`, en
 * base64url sin relleno (43 caracteres). Nunca `Math.random` ni un UUID (que
 * tiene 122 bits aleatorios y una forma reconocible).
 *
 * `cerrarTodasDe` quita las filas: una sesión es una credencial, no un dato
 * de negocio (ver el puerto y el ADR 0024).
 */

import { randomBytes } from "node:crypto";
import { identificadorDesde } from "../../dominio/compartido/identificador.ts";
import type {
  RepositorioSesiones,
  Sesion,
} from "../../puertos/repositorios/sesiones.ts";
import { aFechaHora, aInstante } from "./conversiones.ts";
import type { Sesion as FilaSesion, Prisma } from "./generado/client.ts";

/** 256 bits. */
const BYTES_DEL_TOKEN = 32;

function desdeFila(fila: FilaSesion): Sesion {
  return {
    id: fila.id,
    usuarioId: identificadorDesde<"Usuario">(fila.usuarioId),
    creadaEn: aFechaHora(fila.creadaEn),
    expiraEn: aFechaHora(fila.expiraEn),
    ultimoUso: aFechaHora(fila.ultimoUso),
    agente: fila.agente,
  };
}

/** Un `RepositorioSesiones` sobre `cliente` (o sobre la transacción que lo contiene). */
export function crearRepositorioSesionesPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioSesiones {
  return {
    async abrir(datos) {
      const fila = await cliente.sesion.create({
        data: {
          id: randomBytes(BYTES_DEL_TOKEN).toString("base64url"),
          usuarioId: datos.usuarioId,
          creadaEn: aInstante(datos.creadaEn),
          expiraEn: aInstante(datos.expiraEn),
          ultimoUso: aInstante(datos.creadaEn),
          agente: datos.agente,
        },
      });
      return desdeFila(fila);
    },

    async buscarPorId(id) {
      const fila = await cliente.sesion.findUnique({ where: { id } });
      return fila === null ? null : desdeFila(fila);
    },

    async cerrarTodasDe(usuarioId) {
      const { count } = await cliente.sesion.deleteMany({
        where: { usuarioId },
      });
      return count;
    },
  };
}
