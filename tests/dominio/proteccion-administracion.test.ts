/**
 * La protección del panel (F0-32, R2, ADR 0028) se sostiene página por página:
 * Next no vuelve a renderizar un layout al navegar dentro de un segmento, así
 * que un chequeo solo ahí deja pasar. Estas pruebas recorren el código en
 * vez de confiar en la memoria de quien agregue la próxima página:
 *
 * - toda `page.tsx` de `src/app/administracion/**` llama a
 *   `accesoDeAdministrador()` **antes** de tocar el armado (los datos);
 * - nada de `src/app/administracion/**` es JavaScript de cliente propio;
 * - `/api/salud` sigue pública (es el latido del deploy, P13): responde sin
 *   ninguna sesión y su archivo no importa nada de la sesión.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const RAIZ = path.resolve(import.meta.dirname, "../../src/app");

function archivosBajo(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    return entrada.isDirectory() ? archivosBajo(ruta) : [ruta];
  });
}

const DE_ADMINISTRACION = archivosBajo(path.join(RAIZ, "administracion"));
const PAGINAS = DE_ADMINISTRACION.filter((ruta) =>
  ruta.endsWith(`${path.sep}page.tsx`),
);

describe("/administracion/**", () => {
  test("hay páginas que revisar", () => {
    expect(PAGINAS.length).toBeGreaterThanOrEqual(2);
  });

  test.each(PAGINAS.map((pagina) => [path.relative(RAIZ, pagina), pagina]))(
    "%s exige administrador antes de leer datos",
    (_nombre, pagina) => {
      const codigo = readFileSync(pagina, "utf8");
      const exige = codigo.indexOf("await accesoDeAdministrador()");
      const datos = codigo.indexOf("armado()");

      expect(exige, "no llama a accesoDeAdministrador()").toBeGreaterThan(-1);
      if (datos !== -1) {
        expect(exige).toBeLessThan(datos);
      }
    },
  );

  test("ningún archivo es JavaScript de cliente", () => {
    const deCliente = DE_ADMINISTRACION.filter((ruta) =>
      /^\s*["']use client["']/m.test(readFileSync(ruta, "utf8")),
    );

    expect(deCliente).toEqual([]);
  });
});

describe("/api/salud sigue pública", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test("responde ok sin ninguna cookie ni sesión", async () => {
    vi.stubEnv("APP_VERSION", "prueba-1");
    const { GET } = await import("../../src/app/api/salud/route.ts");

    const respuesta = GET();

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ ok: true, version: "prueba-1" });
  });

  test("su archivo no importa la sesión ni la protección", () => {
    const codigo = readFileSync(
      path.join(RAIZ, "api", "salud", "route.ts"),
      "utf8",
    );

    expect(codigo).not.toMatch(/sesion-actual|accesoDeAdministrador|cookies/);
  });

  test("nada de src/app/api/** exige sesión", () => {
    const protegidos = archivosBajo(path.join(RAIZ, "api")).filter((ruta) =>
      /sesion-actual|accesoDeAdministrador/.test(readFileSync(ruta, "utf8")),
    );

    expect(protegidos).toEqual([]);
  });
});
