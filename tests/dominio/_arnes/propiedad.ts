/**
 * Configuración compartida de fast-check (F0-15, `docs/adr/0015-property-based.md`):
 * el número de corridas por entorno, para que cada archivo de propiedades no
 * lo repita. CI se detecta como en el resto del repo: la variable de entorno
 * `CI` (la misma que usan, por ejemplo, `scripts/db-migrate.ts` o el propio
 * workflow de GitHub Actions).
 *
 * La semilla queda en su valor por defecto de fast-check (`Date.now()`, no
 * una constante fija): cada corrida explora una serie distinta. Si una
 * propiedad falla, `fc.assert` la imprime en el mensaje del error junto con
 * el `counterexamplePath`, y correrla nuevamente con
 * `propiedad(..., { seed, path })` reproduce exactamente el mismo
 * contraejemplo — es el mecanismo de fast-check, no algo que este helper
 * agregue.
 */
import fc from "fast-check";

const NUM_RUNS_LOCAL = 200;
const NUM_RUNS_CI = 1000;

/** Corridas de esta ejecución: 1000 en CI, 200 en local. */
export function numRuns(): number {
  return process.env.CI ? NUM_RUNS_CI : NUM_RUNS_LOCAL;
}

/** La configuración compartida, para quien necesite llamar a `fc.assert` o `fc.check` directo. */
export function configuracion<Ts = void>(): fc.Parameters<Ts> {
  return { numRuns: numRuns() };
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
