/**
 * Cómo se cuenta una falla fuera del dominio (F0-25, ADR 0025): con el
 * código del catálogo siempre, y redactada (`redactar`, F0-24).
 *
 * - `aErrorSistema`: un `ErrorSistema` queda como está; cualquier otra cosa
 *   pasa a `INF-0001` (la falla genérica) con la original como causa.
 * - `detalleDeFalla`: una línea corta para guardar en la base
 *   (`corridas_worker.detalle`): `CODIGO · mensaje`, redactada.
 * - `registrarFalla`: la loguea en `error` con su código y devuelve el
 *   `ErrorSistema`. Loguear no es tragarse el error: quien la llama decide si
 *   además la relanza.
 *
 * Viven acá y no en `src/worker/` porque construyen errores del catálogo
 * (`nuevoError`), y el worker solo puede importar tipos del dominio (regla
 * `app-worker-dominio-solo-tipos`).
 */

import { catalogo } from "../dominio/compartido/errores/catalogo.ts";
import {
  ErrorSistema,
  nuevoError,
} from "../dominio/compartido/errores/error-sistema.ts";
import { paraLog } from "../dominio/compartido/errores/serializar.ts";
import { type Log, redactar } from "./log.ts";

export function aErrorSistema(causa: unknown): ErrorSistema {
  return causa instanceof ErrorSistema
    ? causa
    : nuevoError(catalogo.INF_0001, {}, causa);
}

function mensajeDe(causa: unknown): string {
  return causa instanceof Error ? causa.message : String(causa);
}

/** `CODIGO · descripción[ · causa: mensaje]`, redactado. */
export function detalleDeFalla(causa: unknown): string {
  const error = aErrorSistema(causa);
  const partes = [error.codigo, error.entrada.descripcion];
  if (error.cause !== undefined) {
    partes.push(`causa: ${mensajeDe(error.cause)}`);
  }
  return String(redactar(partes.join(" · ")));
}

/** Loguea la falla en `error`, con su código y los campos de `extra`. */
export function registrarFalla(
  log: Log,
  causa: unknown,
  extra: Readonly<Record<string, unknown>> = {},
): ErrorSistema {
  const error = aErrorSistema(causa);
  log.error({ ...paraLog(error), ...extra }, error.message);
  return error;
}
