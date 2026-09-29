/**
 * Doble en memoria del puerto `Notificaciones` (F0-29): una lista viva solo
 * mientras dura el proceso. `enviados()` no está en el puerto: es un
 * agregado propio del doble, para los tests.
 */
import type { Actor } from "../../dominio/compartido/actor.ts";
import type { Resultado } from "../../dominio/compartido/historial.ts";
import type {
  MensajeInvalido,
  MensajeNotificacion,
  Notificaciones,
} from "../../puertos/notificaciones.ts";
import { CODIGO_MENSAJE_INVALIDO } from "../../puertos/notificaciones.ts";

/** Un envío ya hecho: a quién y qué. */
export interface EnvioRegistrado {
  readonly destinatario: Actor;
  readonly mensaje: MensajeNotificacion;
}

/** Un `Notificaciones` de prueba con `enviados()` para inspección. */
export function crearNotificacionesEnMemoria(): Notificaciones & {
  /** Los envíos hechos, en el orden en que se hicieron. */
  enviados(): readonly EnvioRegistrado[];
} {
  const registros: EnvioRegistrado[] = [];

  return {
    enviar(
      destinatario: Actor,
      mensaje: MensajeNotificacion,
    ): Promise<Resultado<void, MensajeInvalido>> {
      if (mensaje.titulo.trim() === "") {
        return Promise.resolve({
          ok: false,
          error: { codigo: CODIGO_MENSAJE_INVALIDO, campo: "titulo" },
        });
      }
      if (mensaje.cuerpo.trim() === "") {
        return Promise.resolve({
          ok: false,
          error: { codigo: CODIGO_MENSAJE_INVALIDO, campo: "cuerpo" },
        });
      }
      registros.push({ destinatario, mensaje });
      return Promise.resolve({ ok: true, valor: undefined });
    },

    enviados() {
      return [...registros];
    },
  };
}
