/**
 * Los temas (F3-05, ADR 0040): los colores viven una sola vez en
 * `src/app/globales.css`, el claro en `@theme` y el oscuro en el bloque
 * `@variant dark`. Este test los lee de ese mismo archivo —no de una copia que
 * pueda quedar distinta— y exige el contraste WCAG AA de cada par que se usa
 * en las pantallas, en los dos temas.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const CSS = readFileSync(
  path.resolve(import.meta.dirname, "../../src/app/globales.css"),
  "utf8",
);

/** El contenido entre la llave que abre `apertura` y la que la cierra. */
function bloqueDe(css: string, apertura: string): string {
  const inicio = css.indexOf(apertura);
  if (inicio === -1) {
    return "";
  }
  let profundidad = 0;
  for (let i = inicio + apertura.length - 1; i < css.length; i++) {
    if (css[i] === "{") {
      profundidad++;
    } else if (css[i] === "}") {
      profundidad--;
      if (profundidad === 0) {
        return css.slice(inicio + apertura.length, i);
      }
    }
  }
  return "";
}

function coloresDe(bloque: string): ReadonlyMap<string, string> {
  return new Map(
    [...bloque.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)].map(
      ([, nombre, valor]) => [nombre ?? "", (valor ?? "").trim()],
    ),
  );
}

const TEMAS = {
  claro: coloresDe(bloqueDe(CSS, "@theme {")),
  oscuro: coloresDe(bloqueDe(CSS, "@variant dark {")),
};

/** Luminancia relativa de WCAG 2.x de un `#rrggbb`. */
function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((desde) => {
    const canal = Number.parseInt(hex.slice(desde, desde + 2), 16) / 255;
    return canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contraste(a: string, b: string): number {
  const [clara, oscura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((clara ?? 0) + 0.05) / ((oscura ?? 0) + 0.05);
}

/** Texto común: 4.5. Bordes de controles, foco y series de gráfico: 3 (WCAG 1.4.11). */
const PARES: readonly (readonly [string, string, number])[] = [
  ["texto", "fondo", 4.5],
  ["texto", "superficie", 4.5],
  ["texto", "superficie-alta", 4.5],
  ["texto-suave", "fondo", 4.5],
  ["texto-suave", "superficie", 4.5],
  ["texto-suave", "superficie-alta", 4.5],
  ["acento", "fondo", 4.5],
  ["acento", "superficie", 4.5],
  ["sobre-acento", "acento", 4.5],
  ["sobre-acento", "acento-fuerte", 4.5],
  ["peligro", "superficie", 4.5],
  ["peligro", "peligro-suave", 4.5],
  ["texto", "peligro-suave", 4.5],
  ["sobre-peligro", "peligro", 4.5],
  ["sobre-peligro", "peligro-fuerte", 4.5],
  ["exito", "superficie", 4.5],
  ["exito", "exito-suave", 4.5],
  ["aviso", "superficie", 4.5],
  ["aviso", "aviso-suave", 4.5],
  ["menu-texto", "menu", 4.5],
  ["menu-texto", "menu-activo", 4.5],
  ["menu-texto-suave", "menu", 4.5],
  ["borde-control", "fondo", 3],
  ["borde-control", "superficie", 3],
  ["serie-1", "superficie", 3],
  ["serie-2", "superficie", 3],
  ["serie-3", "superficie", 3],
  ["serie-4", "superficie", 3],
];

describe("los colores de los temas", () => {
  test("el claro y el oscuro definen los mismos colores, todos #rrggbb", () => {
    const nombres = [...TEMAS.claro.keys()].sort();

    expect(nombres).toEqual(
      expect.arrayContaining([
        "fondo",
        "superficie",
        "superficie-alta",
        "borde",
        "texto",
        "texto-suave",
        "acento",
        "acento-fuerte",
        "peligro",
        "exito",
        "aviso",
        "menu",
        "serie-1",
      ]),
    );
    expect([...TEMAS.oscuro.keys()].sort()).toEqual(nombres);
    for (const tema of Object.values(TEMAS)) {
      for (const valor of tema.values()) {
        expect(valor).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  describe.each(Object.entries(TEMAS))("tema %s", (_, colores) => {
    test.each(PARES)(
      "%s sobre %s: contraste de al menos %d",
      (a, b, minimo) => {
        const delante = colores.get(a);
        const detras = colores.get(b);

        expect(delante, `falta --color-${a}`).toBeDefined();
        expect(detras, `falta --color-${b}`).toBeDefined();
        expect(contraste(delante ?? "", detras ?? "")).toBeGreaterThanOrEqual(
          minimo,
        );
      },
    );
  });
});
