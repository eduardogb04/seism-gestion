/**
 * Puerto de notificaciones (F0-29): cómo el sistema avisa a un actor
 * puntual. Solo importa de `src/dominio` (dependency-cruiser, regla
 * `puertos-solo-dominio`): nada de `node:*` ni de paquetes, ni el canal
 * (mail, WhatsApp...).
 *
 * Implementado en memoria en Fase 0 (`src/adaptadores/memoria/notificaciones.ts`,
 * para tests); los adaptadores reales (Gmail, WhatsApp, Telegram, SMTP) son
 * Fase 1 y **tienen que pasar la misma suite de contrato**
 * (`tests/contratos/notificaciones.ts`, ver `AGENTS.md`).
 *
 * **Cada aviso tiene un único destinatario**: dirigidas, no difundidas
 * (criterio de Eduardo). No existe una forma de mandar el mismo aviso a
 * varios actores de una sola llamada.
 */
import type { Actor } from "../dominio/compartido/actor.ts";
import type { Resultado } from "../dominio/compartido/historial.ts";

/** Código estable del único modo de fallar de `enviar`. */
export const CODIGO_MENSAJE_INVALIDO =
  "NOTIFICACIONES.MENSAJE_INVALIDO" as const;

/** `titulo` o `cuerpo` vacíos: un aviso sin uno de los dos no dice nada. */
export interface MensajeInvalido {
  readonly codigo: typeof CODIGO_MENSAJE_INVALIDO;
  readonly campo: "titulo" | "cuerpo";
}

/** El contenido de un aviso: título corto, cuerpo y una referencia opcional. */
export interface MensajeNotificacion {
  readonly titulo: string;
  readonly cuerpo: string;
  readonly referencia?: string;
}

export type Notificaciones = {
  /** Manda `mensaje` a un único `destinatario`. `titulo` y `cuerpo` no vacíos. */
  enviar(
    destinatario: Actor,
    mensaje: MensajeNotificacion,
  ): Promise<Resultado<void, MensajeInvalido>>;
};
