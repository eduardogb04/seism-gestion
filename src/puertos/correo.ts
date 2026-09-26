/**
 * Puerto de correo (F0-29): cómo el sistema lee mensajes de un buzón y
 * marca cuáles ya procesó. Solo importa de `src/dominio` (dependency-cruiser,
 * regla `puertos-solo-dominio`): nada de `node:*` ni de paquetes, ni
 * siquiera el nombre del proveedor (Gmail, IMAP...). Esta interfaz no sabe
 * si atrás hay una API o una lista en memoria.
 *
 * Implementado en memoria en Fase 0 (`src/adaptadores/memoria/correo.ts`,
 * para tests); el adaptador de Gmail (y cualquier otro: WhatsApp, Telegram,
 * SMTP) es Fase 1 y **tiene que pasar la misma suite de contrato**
 * (`tests/contratos/correo.ts`, ver `AGENTS.md`).
 *
 * **Idempotencia por `idExterno`.** Pedir dos veces `listarNuevos` desde el
 * mismo cursor devuelve exactamente lo mismo: `marcarProcesado` es la marca
 * del lado del proveedor (un mensaje ya leído), no cambia lo que se lista.
 */
import type { Resultado } from "../dominio/compartido/historial.ts";
import type { FechaHora } from "../dominio/compartido/reloj.ts";

declare const marcaCursor: unique symbol;

/**
 * Un cursor opaco: texto marcado por tipo. Ningún módulo fuera del
 * adaptador que lo emitió sabe (ni necesita saber) qué codifica adentro.
 * `cursorInicial` es el único valor que alguien de afuera puede construir a
 * mano.
 */
export type Cursor = string & { readonly [marcaCursor]: true };

/** El cursor con el que arranca cualquier lectura: antes de todo mensaje. */
export const cursorInicial = "" as Cursor;

/** Un archivo adjunto a un mensaje de correo. */
export interface Adjunto {
  readonly nombre: string;
  readonly tipoMime: string;
  readonly bytes: Uint8Array;
}

/**
 * Un mensaje tal como lo entrega el puerto. `para` nunca está vacío (lo
 * dice el tipo, una tupla no vacía, como `Eventos` en `historial.ts`), y
 * `idExterno` es el identificador que el proveedor le puso: es lo que hace
 * idempotente el listado y lo que identifica a `marcarProcesado`.
 */
export interface MensajeCorreo {
  readonly idExterno: string;
  readonly de: string;
  readonly para: readonly [string, ...string[]];
  readonly asunto: string;
  readonly fecha: FechaHora;
  readonly cuerpoTexto: string;
  readonly adjuntos: readonly Adjunto[];
}

/** Una página de `listarNuevos`: los mensajes y el cursor para la próxima. */
export interface PaginaMensajes {
  readonly mensajes: readonly MensajeCorreo[];
  readonly cursor: Cursor;
}

/** Código estable del único modo de fallar de `marcarProcesado`. */
export const CODIGO_MENSAJE_DESCONOCIDO = "CORREO.MENSAJE_DESCONOCIDO" as const;

/** Se pidió marcar procesado un `idExterno` que el adaptador nunca listó. */
export interface MensajeDesconocido {
  readonly codigo: typeof CODIGO_MENSAJE_DESCONOCIDO;
  readonly idExterno: string;
}

export type Correo = {
  /**
   * Da como mucho `limite` mensajes posteriores a `desde` (100 por defecto),
   * ordenados por `fecha` y después `idExterno`, y el cursor siguiente. Dos
   * llamadas con el mismo `desde` (y el mismo `limite`) devuelven exactamente
   * lo mismo, también después de `marcarProcesado`.
   */
  listarNuevos(desde: Cursor, limite?: number): Promise<PaginaMensajes>;
  /**
   * Marca `idExterno` como procesado del lado del proveedor. Marcar dos
   * veces el mismo `idExterno` no es error. Un `idExterno` que el adaptador
   * nunca listó da `MensajeDesconocido`.
   */
  marcarProcesado(
    idExterno: string,
  ): Promise<Resultado<void, MensajeDesconocido>>;
};
