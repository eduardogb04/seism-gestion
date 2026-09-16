/**
 * La imagen de Postgres (tag y digest, ADR 0006 y 0007) está fija en dos
 * archivos que nadie sincroniza solo: `docker-compose.yml` (el Postgres
 * local, que además lee `tests/casos-uso/migraciones.test.ts` para levantar
 * su Testcontainers) y `.github/workflows/ci.yml` (el `services: postgres`
 * del paso `drift`; ADR 0011 ya deja escrita la consecuencia: "si se sube la
 * imagen de compose, hay que subir la del `services:` de `ci.yml` a mano").
 *
 * Esta extracción es el único lugar que sabe leer la línea `image: postgres:...`
 * de cualquiera de los dos archivos: la comparten `migraciones.test.ts` (para
 * la imagen de compose) e `imagen-postgres.test.ts` (para comparar las dos).
 */

import { readFileSync } from "node:fs";

/** `docker-compose.yml` en la raíz del repo. */
export const RUTA_COMPOSE = "docker-compose.yml";

/** El workflow de CI, con el `services: postgres` del paso `drift` (ADR 0011). */
export const RUTA_CI = ".github/workflows/ci.yml";

const PATRON_IMAGEN = /^\s*image:\s*(postgres:\S+)\s*$/m;

/**
 * La imagen `postgres:<tag>@sha256:<digest>` declarada en `ruta`, o
 * `undefined` si el archivo no tiene ninguna línea `image: postgres:...`.
 */
export function imagenPostgresDeArchivo(ruta: string): string | undefined {
  const contenido = readFileSync(ruta, "utf8");
  return PATRON_IMAGEN.exec(contenido)?.[1];
}
