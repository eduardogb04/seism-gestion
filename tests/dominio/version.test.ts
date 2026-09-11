import { describe, expect, it } from "vitest";
import { resolverVersion } from "../../src/infraestructura/version.ts";

/**
 * F0-04: la versión que devuelve `GET /api/salud` se resuelve en el build
 * (`next.config.ts`): `APP_VERSION` si viene definida (la pasa el build de
 * Docker, que no tiene `.git`), si no el SHA corto de git, y si no hay
 * ninguna de las dos el build falla con un mensaje claro. Nivel dominio: la
 * lectura de git se inyecta, acá no se corre ningún proceso.
 */
describe("resolverVersion", () => {
  it("usa APP_VERSION si viene definida, sin preguntarle a git", () => {
    let consultoGit = false;
    const resultado = resolverVersion("1a2b3c4", () => {
      consultoGit = true;
      return "fffffff";
    });

    expect(resultado).toEqual({ ok: true, version: "1a2b3c4" });
    expect(consultoGit).toBe(false);
  });

  it("si APP_VERSION no está, usa el SHA corto de git", () => {
    const resultado = resolverVersion(undefined, () => "9f8e7d6");

    expect(resultado).toEqual({ ok: true, version: "9f8e7d6" });
  });

  it("trata APP_VERSION vacía como ausente", () => {
    const resultado = resolverVersion("", () => "9f8e7d6");

    expect(resultado).toEqual({ ok: true, version: "9f8e7d6" });
  });

  it("sin APP_VERSION ni git, falla con un mensaje que dice qué falta", () => {
    const resultado = resolverVersion(undefined, () => undefined);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensaje).toContain("APP_VERSION");
      expect(resultado.mensaje).toContain("git");
    }
  });
});
