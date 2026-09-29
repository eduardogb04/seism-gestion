/**
 * Qué pasa cuando algo se escapa (F0-24, ADR 0021): una excepción que nadie
 * capturó (`uncaughtException`) o una promesa rechazada sin `catch`
 * (`unhandledRejection`) se loguea en `fatal` con el código `INF-0001` del
 * catálogo —la causa serializada con `paraLog`, y redactada como todo lo que
 * sale por el log— y el proceso **termina con código 1**. No sigue a medias:
 * lo reinicia Docker.
 *
 * La línea se escribe antes de salir: el log del proceso escribe en la
 * salida estándar en forma síncrona (`crearLog`), y además se le pide
 * `flush` antes de `process.exit`.
 *
 * Lo instala `src/instrumentation.ts` al arrancar la app, después de validar
 * el entorno. El worker (F0-25) lo va a instalar en su punto de entrada.
 */

import { catalogo } from "../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../dominio/compartido/errores/error-sistema.ts";
import { paraLog } from "../dominio/compartido/errores/serializar.ts";
import type { Log } from "./log.ts";

export type OrigenFatal = "uncaughtException" | "unhandledRejection";

function registrarYSalir(log: Log, origen: OrigenFatal, causa: unknown): never {
  const error = nuevoError(catalogo.INF_0001, { origen }, causa);
  log.fatal({ ...paraLog(error), origen }, error.message);
  log.flush();
  process.exit(1);
}

/** Instala los manejadores de `uncaughtException` y `unhandledRejection` del proceso. */
export function instalarManejadoresDeProceso(log: Log): void {
  process.on("uncaughtException", (causa) => {
    registrarYSalir(log, "uncaughtException", causa);
  });
  process.on("unhandledRejection", (causa) => {
    registrarYSalir(log, "unhandledRejection", causa);
  });
}
