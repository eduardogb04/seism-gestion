/**
 * El gráfico de barras y de líneas (F3-05, para el inicio de F3-08): SVG con
 * ejes, una figura por dato y por serie con los colores de serie del tema
 * (nada de colores sueltos: cambian con el tema), leyenda si hay más de una
 * serie, y para el lector de pantalla un nombre (`role="img"`) y una tabla
 * oculta con los mismos números.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Grafico, type Serie } from "../../src/app/_ui/grafico.tsx";

const COBRADO: Serie = {
  nombre: "Cobrado",
  puntos: [
    { etiqueta: "Ene", valor: 100 },
    { etiqueta: "Feb", valor: 250 },
    { etiqueta: "Mar", valor: 175 },
  ],
};
const PAGADO: Serie = {
  nombre: "Pagado",
  puntos: [
    { etiqueta: "Ene", valor: 80 },
    { etiqueta: "Feb", valor: 120 },
    { etiqueta: "Mar", valor: 1500 },
  ],
};

function dibujo(...args: Parameters<typeof Grafico>): string {
  return renderToStaticMarkup(Grafico(...args));
}

function svgDe(html: string): string {
  return /<svg [^>]*role="img"[^>]*>.*<\/svg>/.exec(html)?.[0] ?? "";
}

describe("Grafico", () => {
  test("de barras: una barra por dato y por serie, con el color de su serie", () => {
    const svg = svgDe(
      dibujo({
        tipo: "barras",
        titulo: "Cobrado y pagado",
        series: [COBRADO, PAGADO],
      }),
    );

    expect(svg).toMatch(/aria-label="Cobrado y pagado"/);
    expect(svg.match(/<rect [^>]*fill-serie-1/g)).toHaveLength(3);
    expect(svg.match(/<rect [^>]*fill-serie-2/g)).toHaveLength(3);
  });

  test("de líneas: una línea por serie, con el color de su serie", () => {
    const svg = svgDe(
      dibujo({
        tipo: "lineas",
        titulo: "Evolución",
        series: [COBRADO, PAGADO],
      }),
    );

    expect(svg.match(/<path [^>]*stroke-serie-1/g)).toHaveLength(1);
    expect(svg.match(/<path [^>]*stroke-serie-2/g)).toHaveLength(1);
  });

  test("tiene ejes: las etiquetas abajo y los valores a la izquierda, con formato local", () => {
    const svg = svgDe(
      dibujo({ tipo: "barras", titulo: "Pagado", series: [PAGADO] }),
    );

    for (const etiqueta of ["Ene", "Feb", "Mar"]) {
      expect(svg).toContain(`>${etiqueta}</tspan>`);
    }
    expect(svg).toContain(">1.500</tspan>");
  });

  test("no usa colores sueltos: todo color sale de una clase del tema", () => {
    const svg = svgDe(
      dibujo({
        tipo: "lineas",
        titulo: "Evolución",
        series: [COBRADO, PAGADO],
      }),
    );

    expect(svg).not.toMatch(/(fill|stroke)="#/);
    expect(svg).not.toMatch(/(fill|stroke):\s*#/);
  });

  test("con más de una serie hay leyenda; con una sola, no", () => {
    const dos = dibujo({
      tipo: "barras",
      titulo: "Dos",
      series: [COBRADO, PAGADO],
    });
    const una = dibujo({ tipo: "barras", titulo: "Una", series: [COBRADO] });

    const leyenda =
      /<ul [^>]*data-leyenda[^>]*>(.*?)<\/ul>/.exec(dos)?.[1] ?? "";
    expect(leyenda.replace(/<[^>]+>/g, "|")).toMatch(/Cobrado.*Pagado/);
    expect(leyenda).toContain("bg-serie-1");
    expect(leyenda).toContain("bg-serie-2");
    expect(una).not.toContain("data-leyenda");
  });

  test("el lector de pantalla tiene una tabla oculta con los mismos números", () => {
    const html = dibujo({
      tipo: "barras",
      titulo: "Dos",
      series: [COBRADO, PAGADO],
    });

    const tabla = /<table class="sr-only">(.*?)<\/table>/.exec(html)?.[1] ?? "";
    expect(tabla).toContain("<caption>Dos</caption>");
    const filas = [...tabla.matchAll(/<tr>(.*?)<\/tr>/g)].map(([, fila]) =>
      [...(fila ?? "").matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map(
        ([, c]) => c,
      ),
    );
    expect(filas).toEqual([
      ["", "Cobrado", "Pagado"],
      ["Ene", "100", "80"],
      ["Feb", "250", "120"],
      ["Mar", "175", "1.500"],
    ]);
  });

  test("sin datos, lo dice en vez de dibujar ejes vacíos", () => {
    const html = dibujo({
      tipo: "lineas",
      titulo: "Nada",
      series: [{ nombre: "Cobrado", puntos: [] }],
    });

    expect(html).not.toContain("<svg");
    expect(html).toContain("No hay datos para mostrar.");
  });
});
