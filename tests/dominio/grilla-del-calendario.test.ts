/**
 * La grilla del calendario (F4-04): hasta tres entradas por día y «+N» que
 * lleva a la lista; cada tipo con su color del tema y lo vencido marcado.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { GrillaDelMes } from "../../src/app/calendario/grilla.tsx";
import type { EntradaDelCalendario } from "../../src/casos-uso/calendario/calendario.ts";

function entrada(
  parcial: Partial<EntradaDelCalendario> & Pick<EntradaDelCalendario, "enlace">,
): EntradaDelCalendario {
  return {
    tipo: "vencimiento",
    fecha: "2031-07-12",
    titulo: "Una entrada de ejemplo",
    importe: null,
    vencida: false,
    ...parcial,
  };
}

function grillaCon(entradas: readonly EntradaDelCalendario[]): string {
  return renderToStaticMarkup(
    createElement(GrillaDelMes, {
      semanas: [[{ dia: 12, fecha: "2031-07-12", entradas }]],
    }),
  );
}

describe("GrillaDelMes", () => {
  test("con cuatro entradas en un día muestra tres con su enlace y «+1» que lleva a la lista", () => {
    const html = grillaCon(
      ["/a", "/b", "/c", "/d"].map((enlace) => entrada({ enlace })),
    );

    for (const enlace of ["/a", "/b", "/c"]) {
      expect(html).toContain(`href="${enlace}"`);
    }
    expect(html).not.toContain('href="/d"');
    expect(html).toMatch(/<a href="#lista"[^>]*>\+1<\/a>/);
  });

  test("con tres entradas no hay «+N»", () => {
    const html = grillaCon(
      ["/a", "/b", "/c"].map((enlace) => entrada({ enlace })),
    );

    expect(html).not.toContain("#lista");
  });

  test("cada tipo tiene su color y una entrada vencida dice «Vencido»", () => {
    const html = grillaCon([
      entrada({ tipo: "vencimiento", enlace: "/v" }),
      entrada({ tipo: "factura", enlace: "/f" }),
      entrada({ tipo: "egreso", enlace: "/e", vencida: true }),
    ]);

    expect(html).toMatch(/border-serie-1[^>]*>[^<]*Una entrada/);
    expect(html).toMatch(/href="\/f"[^>]*border-serie-2/);
    expect(html).toMatch(/href="\/e"[^>]*border-serie-3/);
    expect(html).toMatch(/Vencido ·/);
    expect(html.match(/Vencido/g)).toHaveLength(1);
  });
});
