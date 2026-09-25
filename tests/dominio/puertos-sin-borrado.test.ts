/**
 * F0-22, R4: "no existe `eliminar` físico en ningún puerto de repositorio".
 * En vez de confiar en la revisión, este test usa la API del compilador de
 * TypeScript (como `scripts/sin-any.ts`) para listar los métodos y
 * propiedades-función de toda interfaz/tipo exportado bajo `src/puertos/**`
 * (incluye `repositorios/` cuando exista — hoy no existe, y el test no
 * puede depender de que exista) y falla si algún nombre empieza con
 * `eliminar`, `borrar`, `delete`, `remove`, `destroy` o `purgar`.
 *
 * `marcarEliminado` (`src/dominio/compartido/auditable.ts`) es la única
 * forma de "borrar": un borrado lógico, no físico.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { metodosDeBorradoFisico } from "./_arnes/puertos-sin-borrado.ts";

const raizDelRepo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("ningún puerto declara borrado físico", () => {
  it("src/puertos no tiene ningún método eliminar/borrar/delete/remove/destroy/purgar", () => {
    const carpetaPuertos = path.join(raizDelRepo, "src/puertos");
    expect(metodosDeBorradoFisico(carpetaPuertos)).toEqual([]);
  });

  it("detecta un puerto que sí declara `eliminar` (fixture que tiene que dar rojo)", () => {
    const carpetaFixture = path.join(
      raizDelRepo,
      "tests/fixtures/puertos-con-borrado",
    );
    const encontrados = metodosDeBorradoFisico(carpetaFixture);

    expect(encontrados).toHaveLength(1);
    expect(encontrados[0]?.nombre).toBe("eliminar");
  });
});
