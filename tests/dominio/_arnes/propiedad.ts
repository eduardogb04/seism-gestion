/**
 * Configuración compartida de fast-check (F0-15, `docs/adr/0015-property-based.md`):
 * el número de corridas por entorno y la semilla, para que cada archivo de
 * propiedades no los repita. CI se detecta como en el resto del repo: la
 * variable de entorno `CI` (la misma que usan, por ejemplo,
 * `scripts/db-migrate.ts` o el propio workflow de GitHub Actions).
 *
 * La semilla la resuelve y la anuncia `./semilla.ts` (`globalSetup` del
 * proyecto `dominio`, una vez por tanda) y llega acá por `inject`: fija con
 * `FC_SEED` si se definió esa variable al correr `npm run test:dominio`, al
 * azar (`Date.now()`) si no. Cualquiera de las dos queda impresa al empezar
 * la tanda —pase o falle— con el comando exacto para reproducirla.
 */

import fc from "fast-check";
import { inject } from "vitest";

const NUM_RUNS_LOCAL = 200;
const NUM_RUNS_CI = 1000;

/** Corridas de esta ejecución: 1000 en CI, 200 en local. */
export function numRuns(): number {
  return process.env.CI ? NUM_RUNS_CI : NUM_RUNS_LOCAL;
}

/** La configuración compartida, para quien necesite llamar a `fc.assert` o `fc.check` directo. */
export function configuracion<Ts = void>(): fc.Parameters<Ts> {
  return { numRuns: numRuns(), seed: inject("semillaFastCheck") };
}

/**
 * Corre una propiedad con la configuración compartida. Mismos argumentos que
 * `fc.property` (una o más arbitrarias y el predicado al final); equivale a
 * `fc.assert(fc.property(...args), configuracion())`.
 */
export function propiedad<Ts extends [unknown, ...unknown[]]>(
  ...args: [
    ...arbitrarios: { [K in keyof Ts]: fc.Arbitrary<Ts[K]> },
    predicado: (...args: Ts) => boolean | undefined,
  ]
): void {
  fc.assert(fc.property(...args), configuracion<Ts>());
}
