/**
 * F0-11 (cimiento 2): "un cambio de esquema sin su migración pone la corrida
 * en rojo" también vale para una migración a la que le falta el `down.sql`
 * (P1). Es el test que pide el plan para ese criterio en particular: no
 * necesita Docker, así que corre siempre, aunque el de F0-09
 * (`migraciones.test.ts`) ya haga la misma verificación como parte de su
 * corrida completa contra un Postgres de Testcontainers.
 *
 * Comparte la lista de migraciones con `scripts/lib/migraciones.ts` (la misma
 * que usan `db:migrate:down` y `migraciones.test.ts`) para no repetir cómo se
 * recorre `prisma/migrations/`.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  CARPETA_MIGRACIONES,
  listarMigraciones,
} from "../../scripts/lib/migraciones.ts";

describe("migraciones completas (F0-11)", () => {
  test("cada carpeta de prisma/migrations tiene migration.sql y down.sql", () => {
    const migraciones = listarMigraciones();
    expect(migraciones.length).toBeGreaterThan(0);

    const sinDown = migraciones.filter(
      (nombre) =>
        !existsSync(path.join(CARPETA_MIGRACIONES, nombre, "down.sql")),
    );
    expect(sinDown, "migraciones sin down.sql (P1)").toEqual([]);
  });
});
