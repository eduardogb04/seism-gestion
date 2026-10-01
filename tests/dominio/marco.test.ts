/**
 * El marco de lo que está detrás del login (F1-02): menú con las secciones que
 * existen y que la persona puede ver, cabecera con su email y *Salir*, y el
 * contenido. Además, `src/app/_ui/` es HTML del servidor: ningún componente
 * lleva `"use client"` (lo exigen `/salud` sin JavaScript y el selector nativo),
 * salvo el formulario del molde de ABM (F1-03, ADR 0031).
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Marco } from "../../src/app/_ui/marco.tsx";

function marcoDe(
  rol: "administrador" | "operador",
  rutaActual = "/salud",
): string {
  return renderToStaticMarkup(
    Marco({
      email: "persona@ejemplo.test",
      rol,
      rutaActual,
      children: "contenido de prueba",
    }),
  );
}

describe("Marco", () => {
  test("el administrador ve en el menú Usuarios y Salud, con sus rutas", () => {
    const marcado = marcoDe("administrador");

    expect(marcado).toMatch(
      /<a [^>]*href="\/administracion\/usuarios"[^>]*>Usuarios</,
    );
    expect(marcado).toMatch(/<a [^>]*href="\/salud"[^>]*>Salud</);
  });

  test("los catálogos van antes que lo que es solo del administrador", () => {
    const marcado = marcoDe("administrador");

    expect(marcado).toMatch(/<a [^>]*href="\/catalogo\/grupos"[^>]*>Grupos</);
    expect(marcado.indexOf(">Grupos<")).toBeLessThan(
      marcado.indexOf(">Usuarios<"),
    );
  });

  test("un operador ve Grupos y no ve Usuarios ni Salud", () => {
    const marcado = marcoDe("operador");

    expect(marcado).toMatch(/<a [^>]*href="\/catalogo\/grupos"[^>]*>Grupos</);

    expect(marcado).not.toContain("/administracion/usuarios");
    expect(marcado).not.toContain('href="/salud"');
  });

  test("marca la sección actual con aria-current y solo esa", () => {
    const marcado = marcoDe("administrador", "/salud");

    expect(marcado.match(/aria-current="page"/g)).toHaveLength(1);
    expect(marcado).toMatch(/<a [^>]*aria-current="page"[^>]*>Salud</);
  });

  test("la cabecera trae el email y un Salir que hace POST a /salir", () => {
    const marcado = marcoDe("administrador");

    expect(marcado).toContain("persona@ejemplo.test");
    const formulario = marcado.match(/<form [^>]*>/)?.[0] ?? "";
    expect(formulario).toContain('action="/salir"');
    expect(formulario).toContain('method="post"');
    expect(marcado).toMatch(/<button [^>]*>Salir</);
    expect(marcado).not.toContain("data-email-sesion");
  });

  test("muestra el contenido de la página", () => {
    expect(marcoDe("administrador")).toContain("contenido de prueba");
  });
});

describe("src/app/_ui/**", () => {
  const CARPETA = path.resolve(import.meta.dirname, "../../src/app/_ui");

  test('solo el formulario del molde de ABM declara "use client"', () => {
    const archivos = readdirSync(CARPETA);
    expect(archivos.length).toBeGreaterThanOrEqual(5);

    const deCliente = archivos.filter((nombre) =>
      /^\s*["']use client["']/m.test(
        readFileSync(path.join(CARPETA, nombre), "utf8"),
      ),
    );

    expect(deCliente).toEqual(["formulario-abm.tsx"]);
  });
});
