/**
 * La tabla y el listado del molde (F3-05): el orden se cambia tocando el
 * título de la columna, que muestra hacia dónde ordena, y cuando la definición
 * tiene `rutaDeFila` la fila entera lleva al detalle, con un enlace de verdad
 * (anda con Tab y Enter sin JavaScript) que se estira a toda la fila.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  ListadoAbm,
  type ListadoVisible,
} from "../../src/app/_ui/listado-abm.tsx";
import { Tabla } from "../../src/app/_ui/tabla.tsx";
import { cabecerasDe } from "../../src/casos-uso/abm/definicion.ts";
import {
  conDefinicion,
  DEFINICIONES,
} from "../../src/casos-uso/abm/definiciones.ts";

const LISTADO: ListadoVisible = {
  registros: [{ valor: { id: "id-uno" } }, { valor: { id: "id-dos" } }],
  celdas: {
    "id-uno": ["Ficticio Uno", "Nota uno"],
    "id-dos": ["Ficticio Dos", "Nota dos"],
  },
  total: 2,
  pagina: 1,
  paginas: 1,
  buscar: "",
  orden: "nombre",
  direccion: "asc",
  filtros: [],
};

function listado(
  props: Partial<Parameters<typeof ListadoAbm>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(ListadoAbm, {
      ruta: "/catalogo/inventados",
      singular: "inventado",
      cabeceras: ["Nombre", "Nota"],
      ordenes: [{ columna: "nombre", etiqueta: "Nombre" }],
      listado: LISTADO,
      puedeEscribir: false,
      acciones: null,
      ...props,
    }),
  );
}

/** El `<th>` cuyo texto visible es `texto`. */
function cabecera(html: string, texto: string): string | undefined {
  return [...html.matchAll(/<th[^>]*>.*?<\/th>/g)]
    .map(([th]) => th)
    .find((th) => th.replace(/<[^>]+>/g, "") === texto);
}

describe("Tabla", () => {
  test("una cabecera ordenable es un enlace con aria-sort y el ícono de su sentido", () => {
    const html = renderToStaticMarkup(
      Tabla({
        cabeceras: [
          { texto: "Fecha", orden: { sentido: "desc", enlace: "/x?a=1" } },
          { texto: "Concepto", orden: { sentido: null, enlace: "/x?b=2" } },
          "Importe",
        ],
        children: null,
      }),
    );

    const fecha = cabecera(html, "Fecha") ?? "";
    expect(fecha).toContain('aria-sort="descending"');
    expect(fecha).toMatch(/<a [^>]*href="\/x\?a=1"/);
    expect(fecha).toContain("lucide-arrow-down");

    const concepto = cabecera(html, "Concepto") ?? "";
    expect(concepto).not.toContain("aria-sort");
    expect(concepto).toMatch(/<a [^>]*href="\/x\?b=2"/);
    expect(concepto).toContain("lucide-chevrons-up-down");

    expect(cabecera(html, "Importe")).toBe("<th>Importe</th>");
  });
});

describe("ListadoAbm", () => {
  test("no hay un control de orden aparte: se ordena desde el título de la columna", () => {
    const html = listado();

    expect(html).not.toContain("Ordenar por:");
    const nombre = cabecera(html, "Nombre") ?? "";
    expect(nombre).toContain('aria-sort="ascending"');
    expect(nombre).toContain("lucide-arrow-up");
    expect(nombre).toMatch(
      /href="\/catalogo\/inventados\?orden=nombre&amp;direccion=desc&amp;pagina=1"/,
    );
    expect(cabecera(html, "Nota")).toBe("<th>Nota</th>");
  });

  test("tocar el título de otra columna ordena por ella de menor a mayor", () => {
    const html = listado({
      cabeceras: ["Nombre", "Nota"],
      ordenes: [
        { columna: "nombre", etiqueta: "Nombre" },
        { columna: "nota", etiqueta: "Nota" },
      ],
    });

    expect(cabecera(html, "Nota")).toMatch(
      /href="\/catalogo\/inventados\?orden=nota&amp;direccion=asc&amp;pagina=1"/,
    );
  });

  test("con rutaDeFila, la primera celda es un enlace que cubre toda la fila y las acciones quedan encima", () => {
    const html = listado({
      rutaDeFila: (id) => `/inventados/${id}`,
      acciones: () => createElement("a", { href: "/editar" }, "Editar"),
    });

    const fila = /<tr class="([^"]*)"[^>]*>(.*?)<\/tr>/.exec(html);
    expect(fila?.[1]).toContain("relative");
    const [primera, , acciones] = [
      ...(fila?.[2] ?? "").matchAll(/<td[^>]*>.*?<\/td>/g),
    ].map(([td]) => td);
    expect(primera).toMatch(/<a [^>]*href="\/inventados\/id-uno"/);
    expect(primera).toMatch(/class="[^"]*after:absolute[^"]*after:inset-0/);
    expect(acciones).toMatch(/<td class="[^"]*relative[^"]*z-10/);
  });

  test("sin rutaDeFila, la fila no es un enlace", () => {
    const html = listado();

    expect(html).not.toContain("after:absolute");
    expect(html).toContain("<td");
    expect(html).not.toMatch(/<td[^>]*><a /);
  });
});

describe("las definiciones de ABM", () => {
  test.each(Object.keys(DEFINICIONES))(
    "%s: cada columna de orden es una cabecera del listado (si no, no habría dónde tocar para ordenar)",
    (entidad) => {
      const sinCabecera = conDefinicion(entidad, (definicion) =>
        definicion.orden
          .map((columna) => definicion.campos[columna].etiqueta)
          .filter((etiqueta) => !cabecerasDe(definicion).includes(etiqueta)),
      );

      expect(sinCabecera).toEqual([]);
    },
  );
});
