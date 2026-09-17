/**
 * Anuncia la semilla y el `numRuns` de fast-check antes de correr la tanda de
 * dominio (F0-15, `docs/adr/0015-property-based.md`).
 *
 * Es un `globalSetup` de Vitest (proyecto `dominio` en `vitest.config.ts`):
 * corre una sola vez en el proceso principal, antes de que arranque
 * cualquier archivo de test — es el único lugar que ve "el principio de la
 * tanda" en vez de "el principio de un archivo" (los tests corren en
 * archivos aislados; un `console.log` puesto ahí se repetiría una vez por
 * archivo). Imprime siempre, pase o falle la corrida, así cualquier corrida
 * se puede reproducir con `FC_SEED=<semilla> npm run test:dominio`.
 *
 * La semilla se le pasa a los tests con `provide`/`inject`, como hace
 * `tests/casos-uso/_arnes/contenedor.ts` con los datos del contenedor: es el
 * mecanismo de Vitest para esto, no una variable de entorno leída dos veces
 * (que además no está garantizado que un test la vea igual que el
 * `globalSetup` si algún día un proyecto corre archivos en procesos aparte).
 */
import process from "node:process";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  interface ProvidedContext {
    semillaFastCheck: number;
  }
}

/** `FC_SEED` fija la semilla; sin ella (o si no es un número), se sortea una. */
function resolverSemilla(): number {
  const variable = process.env.FC_SEED;
  if (variable === undefined || variable === "") {
    return Date.now();
  }
  const provista = Number(variable);
  return Number.isFinite(provista) ? provista : Date.now();
}

export default function anunciarSemilla(proyecto: TestProject): void {
  const semilla = resolverSemilla();
  const numRuns = process.env.CI ? 1000 : 200;

  console.log(
    `[fast-check] semilla=${semilla} numRuns=${numRuns} — para reproducir esta tanda: FC_SEED=${semilla} npm run test:dominio`,
  );

  proyecto.provide("semillaFastCheck", semilla);
}
