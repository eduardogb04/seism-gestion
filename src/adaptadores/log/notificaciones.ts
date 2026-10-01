/**
 * Adaptador `notificaciones-por-log` (M-05): implementa el puerto
 * `Notificaciones` escribiendo un `warn`. En Fase 0 no hay canal real
 * (WhatsApp y Telegram son Fase 1): el aviso queda en el log, que es lo que
 * el administrador lee con `docker logs`.
 *
 * El destinatario sale como `usuarioId` (o el nombre del proceso, si es uno
 * del sistema): **nunca su email**. Pasa la misma suite de contrato que el
 * doble en memoria (`tests/contratos/notificaciones.ts`).
 */
import type { Actor } from "../../dominio/compartido/actor.ts";
import type { Resultado } from "../../dominio/compartido/historial.ts";
import type { Log } from "../../infraestructura/log.ts";
import {
  CODIGO_MENSAJE_INVALIDO,
  type MensajeInvalido,
  type MensajeNotificacion,
  type Notificaciones,
} from "../../puertos/notificaciones.ts";

function quienEs(destinatario: Actor): string {
  return destinatario.tipo === "persona"
    ? destinatario.usuarioId
    : destinatario.proceso;
}

function campoVacio(mensaje: MensajeNotificacion): MensajeInvalido | null {
  if (mensaje.titulo.trim() === "") {
    return { codigo: CODIGO_MENSAJE_INVALIDO, campo: "titulo" };
  }
  if (mensaje.cuerpo.trim() === "") {
    return { codigo: CODIGO_MENSAJE_INVALIDO, campo: "cuerpo" };
  }
  return null;
}

export function crearNotificacionesPorLog(log: Log): Notificaciones {
  return {
    enviar(
      destinatario: Actor,
      mensaje: MensajeNotificacion,
    ): Promise<Resultado<void, MensajeInvalido>> {
      const invalido = campoVacio(mensaje);
      if (invalido !== null) {
        return Promise.resolve({ ok: false, error: invalido });
      }
      log.warn(
        { destinatario: quienEs(destinatario), mensaje },
        "aviso para el administrador (sin canal real en Fase 0)",
      );
      return Promise.resolve({ ok: true, valor: undefined });
    },
  };
}
