/**
 * La imagen de Postgres está fijada por digest y repetida en tres lugares:
 * los servicios `postgres` y `postgres-e2e` de `docker-compose.yml` y el
 * `services: postgres` de `.github/workflows/ci.yml`. Este test exige que las
 * tres referencias `postgres:<tag>@sha256:<digest>` sean idénticas: si alguien
 * sube el digest en un solo lugar, el drift de CI y `npm test` dejarían de
 * probar contra la misma base. Dependabot (ecosistema `docker-compose`) sube
 * los dos de compose; el de CI se cambia a mano (AGENTS.md, *Base de datos*).
 *
 * Lee los archivos con `node:fs`, sin parser de YAML: busca las líneas
 * `image: postgres:...`. Sin red ni base: es del nivel dominio.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REFERENCIA_FIJADA = /^postgres:[\w.-]+@sha256:[0-9a-f]{64}$/;

/** Las referencias que siguen a `image: postgres:` en un archivo de texto. */
function imagenesPostgres(ruta: string): string[] {
  const texto = readFileSync(ruta, "utf8");
  return [...texto.matchAll(/^\s*image:\s*(postgres:\S+)\s*$/gm)].flatMap(
    (coincidencia) => (coincidencia[1] === undefined ? [] : [coincidencia[1]]),
  );
}

/** Lo mismo que lee `tests/casos-uso/_arnes/contenedor.ts` (primera aparición). */
const EXPRESION_DEL_ARNES = String.raw`/^\s*image:\s*(postgres:\S+)\s*$/m`;

describe("la imagen de Postgres fijada por digest", () => {
  const compose = imagenesPostgres("docker-compose.yml");
  const ci = imagenesPostgres(".github/workflows/ci.yml");
  const todas = [...compose, ...ci];

  it("aparece en los tres lugares: dos servicios de compose y `services` de CI", () => {
    expect(compose).toHaveLength(2);
    expect(ci).toHaveLength(1);
    expect(todas.length).toBeGreaterThanOrEqual(3);
  });

  it("es idéntica en todos, con tag y digest completos", () => {
    const distintas = [...new Set(todas)];
    expect(
      distintas,
      `las referencias de la imagen de Postgres tienen que ser idénticas en docker-compose.yml (postgres y postgres-e2e) y en .github/workflows/ci.yml; hay ${distintas.length} distintas: ${distintas.join(" | ")}`,
    ).toHaveLength(1);
    for (const referencia of todas) {
      expect(referencia).toMatch(REFERENCIA_FIJADA);
    }
  });

  it("es la que lee el arnés de casos de uso (el test de migraciones)", () => {
    const arnes = readFileSync("tests/casos-uso/_arnes/contenedor.ts", "utf8");
    expect(arnes).toContain('readFileSync("docker-compose.yml", "utf8")');
    expect(arnes).toContain(EXPRESION_DEL_ARNES);

    const compose = readFileSync("docker-compose.yml", "utf8");
    const primera = /^\s*image:\s*(postgres:\S+)\s*$/m.exec(compose)?.[1];
    expect(primera).toBe(todas[0]);
  });
});
