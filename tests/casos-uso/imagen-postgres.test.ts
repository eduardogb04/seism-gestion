/**
 * La imagen de Postgres (tag y digest) vive fija en dos archivos que nadie
 * sincroniza solo: `docker-compose.yml` (el Postgres local, y la que lee
 * `migraciones.test.ts` para su Testcontainers) y
 * `.github/workflows/ci.yml` (el `services: postgres` del paso `drift`). El
 * propio ADR 0011 deja escrita esta consecuencia: "si `docker-compose.yml`
 * sube la imagen de Postgres, hay que subir la del `services:` de `ci.yml` a
 * mano". Sin este test, subir una sin la otra deja el paso `drift` de CI
 * corriendo contra una versión de Postgres distinta de la que usan
 * `migraciones.test.ts` y el Postgres local, sin que nada lo avise hasta que
 * algo dependiente de la versión de Postgres se comporte distinto entre los
 * dos.
 *
 * Sin Docker: solo lee los dos archivos de texto y compara, como
 * `migraciones-completas.test.ts` (F0-11) — por eso vive en `tests/casos-uso/`
 * a pesar de que el resto de la carpeta necesita Testcontainers.
 */

import { describe, expect, test } from "vitest";
import {
  imagenPostgresDeArchivo,
  RUTA_CI,
  RUTA_COMPOSE,
} from "../../scripts/lib/imagen-postgres.ts";

describe("imagen de Postgres: docker-compose.yml y ci.yml", () => {
  test("la misma imagen (tag y digest) en los dos archivos", () => {
    const deCompose = imagenPostgresDeArchivo(RUTA_COMPOSE);
    const deCi = imagenPostgresDeArchivo(RUTA_CI);

    expect(
      deCompose,
      `${RUTA_COMPOSE} no tiene una imagen postgres:`,
    ).toBeDefined();
    expect(deCi, `${RUTA_CI} no tiene una imagen postgres:`).toBeDefined();

    expect(
      deCi,
      `la imagen de Postgres no coincide entre ${RUTA_COMPOSE} (${deCompose}) y ${RUTA_CI} ` +
        `(${deCi}). Subí las dos juntas (tag y digest; ver ADR 0011).`,
    ).toBe(deCompose);
  });
});
