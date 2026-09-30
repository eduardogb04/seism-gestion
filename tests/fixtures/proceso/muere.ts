/**
 * Proceso que muere a propósito (F0-24): instala los manejadores de
 * `src/infraestructura/proceso.ts` y después, según el argumento, lanza una
 * excepción que nadie captura (`lanza`) o rechaza una promesa sin `catch`
 * (`rechaza`). Lo levanta `tests/casos-uso/log.test.ts` con `node` y afirma
 * que sale con código 1, que la salida trae `INF-0001` y que nunca llega a
 * imprimir `SIGUIO_VIVO`. El email del mensaje es inventado: el test afirma
 * que sale redactado.
 */

import { crearLog } from "../../../src/infraestructura/log.ts";
import { instalarManejadoresDeProceso } from "../../../src/infraestructura/proceso.ts";

instalarManejadoresDeProceso(crearLog({ formato: "json", nivel: "info" }));

const modo = process.argv[2];
const causa = new Error("falla ficticia al avisar a alguien@ejemplo.test");

if (modo === "lanza") {
  setTimeout(() => {
    throw causa;
  }, 10);
} else if (modo === "rechaza") {
  void Promise.reject(causa);
} else {
  process.stderr.write(`modo desconocido: ${String(modo)}\n`);
  process.exit(2);
}

setTimeout(() => {
  process.stdout.write("SIGUIO_VIVO\n");
}, 500);
