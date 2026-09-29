/**
 * Semilla y `numRuns` de fast-check (F0-15, `docs/adr/0015-property-based.md`),
 * compartidos entre el arnés del proyecto `dominio`
 * (`tests/dominio/_arnes/semilla.ts`, que además los publica por
 * `provide`/`inject`) y las suites de contrato de `tests/contratos/`
 * (F0-29, R14 de la ficha), que tienen que respetar la misma configuración
 * sin poder depender del `globalSetup` exclusivo de `dominio`: una suite de
 * contrato tiene que poder correr también en el proyecto `casos-uso` el día
 * que un adaptador real la necesite ahí.
 */
import process from "node:process";

/** `FC_SEED` fija la semilla; sin ella (o si no es un número), se sortea una. */
export function resolverSemillaFastCheck(): number {
  const variable = process.env.FC_SEED;
  if (variable === undefined || variable === "") {
    return Date.now();
  }
  const provista = Number(variable);
  return Number.isFinite(provista) ? provista : Date.now();
}

/** 1000 en CI, 200 en local: el mismo criterio en toda la suite. */
export function numRunsFastCheck(): number {
  return process.env.CI ? 1000 : 200;
}
