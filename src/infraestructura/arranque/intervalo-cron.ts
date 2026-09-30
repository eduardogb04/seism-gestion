/**
 * Cada cuánto corre un job (F0-26, R3): la diferencia entre dos ejecuciones
 * consecutivas de su expresión cron, calculada con `croner` (el mismo que usa
 * el planificador del worker). El panel de salud lo usa para decidir si un
 * job está atrasado (más del doble de su intervalo sin correr). Se calcula
 * **una vez**, al armar el panel, no en cada pedido.
 *
 * Una expresión inválida lanza (la rechaza `croner`): un job con un cron
 * roto no llega hasta acá, porque el worker tampoco arrancaría.
 */

import { Cron } from "croner";

export function intervaloDeCron(expresion: string): number {
  const cron = new Cron(expresion, { paused: true });
  const [primera, segunda] = cron.nextRuns(2);
  cron.stop();
  if (primera === undefined || segunda === undefined) {
    throw new RangeError(
      `la expresión cron "${expresion}" no tiene dos ejecuciones consecutivas`,
    );
  }
  return segunda.getTime() - primera.getTime();
}
