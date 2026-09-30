/**
 * Cada cuánto corre un job (F0-26, R3; M-07): el **mayor** intervalo entre
 * dos ejecuciones consecutivas de las próximas `EJECUCIONES` de su expresión
 * cron, calculado con `croner` (el mismo que usa el planificador del worker).
 * Con una expresión regular (cada cinco minutos) todos los intervalos son iguales;
 * con una irregular (`0 9 * * 1-5`, días hábiles) el mayor es el que cruza el
 * fin de semana, así un job de lunes a viernes no se ve rojo el lunes. El
 * panel de salud lo usa para decidir si un job está atrasado (más del doble de
 * su intervalo sin correr). Se calcula **una vez**, al armar el panel, no en
 * cada pedido.
 *
 * Una expresión inválida lanza (la rechaza `croner`): un job con un cron
 * roto no llega hasta acá, porque el worker tampoco arrancaría.
 */

import { Cron } from "croner";

/** Cuántas ejecuciones próximas se miran: alcanzan para cruzar una semana entera de días hábiles. */
const EJECUCIONES = 8;

export function intervaloDeCron(expresion: string): number {
  const cron = new Cron(expresion, { paused: true });
  const proximas = cron.nextRuns(EJECUCIONES);
  cron.stop();
  if (proximas.length < 2) {
    throw new RangeError(
      `la expresión cron "${expresion}" no tiene dos ejecuciones consecutivas`,
    );
  }
  let mayor = 0;
  for (let i = 1; i < proximas.length; i++) {
    const anterior = proximas[i - 1];
    const actual = proximas[i];
    if (anterior !== undefined && actual !== undefined) {
      mayor = Math.max(mayor, actual.getTime() - anterior.getTime());
    }
  }
  return mayor;
}
