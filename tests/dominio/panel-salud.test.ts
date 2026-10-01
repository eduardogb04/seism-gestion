/**
 * El HTML del panel de salud (F0-26): lo que ve la persona en `/salud`, con
 * un `Salud` armado a mano (todo inventado). Nivel dominio: solo renderiza a
 * texto en el servidor, sin red ni base. Verifica las cuatro secciones, el
 * verde/rojo de cada cosa, que un fallido muestre código y edad pero nunca su
 * carga, y que un error de la lectura se diga con su código sin romper el
 * resto.
 */

import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { PanelSalud } from "../../src/app/salud/panel-salud.tsx";
import type { Salud } from "../../src/casos-uso/salud/listar-salud.ts";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

function corrida(
  haceMs: number,
  resultado: "ok" | "error" | null,
  detalle: string | null = null,
) {
  return {
    inicio: new Date("2026-03-10T11:00:00.000Z"),
    fin: resultado === null ? null : new Date("2026-03-10T11:00:01.000Z"),
    resultado,
    detalle,
    haceMs,
  };
}

const SALUD: Salud = {
  jobs: [
    { job: "latido", estado: "ok", ultimaCorrida: corrida(3 * MINUTO, "ok") },
    {
      job: "atrasado",
      estado: "rojo",
      motivo: "no corrió en el doble de su intervalo",
      ultimaCorrida: corrida(3 * DIA, "ok"),
    },
    {
      job: "roto",
      estado: "rojo",
      motivo: "la última corrida terminó en error",
      ultimaCorrida: corrida(
        5 * MINUTO,
        "error",
        "INF-0001 · Falló algo · causa: postgres://usuario:secreto@host-inventado/base",
      ),
    },
    {
      job: "nuevo",
      estado: "rojo",
      motivo: "nunca corrió",
      ultimaCorrida: null,
    },
    { job: "en-curso", estado: "ok", ultimaCorrida: corrida(MINUTO, null) },
  ],
  fallidosPendientes: 120,
  fallidos: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      origen: "ingesta.correo",
      codigoError: "ING-0001",
      haceMs: 2 * DIA,
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      origen: "ingesta.remito",
      codigoError: "INF-0002",
      haceMs: 4 * HORA,
    },
  ],
  integraciones: [
    {
      nombre: "base",
      estado: "ok",
      ultimaPruebaOk: { en: "2026-03-10 12:00:00", haceMs: 0 },
    },
    {
      nombre: "almacen",
      estado: "error",
      detalle: "INF-0001 · Falló algo inesperado",
      ultimaPruebaOk: { en: "2026-03-09 08:30:00", haceMs: DIA },
    },
    {
      nombre: "correo",
      estado: "error",
      detalle: "INF-0001 · x",
      ultimaPruebaOk: null,
    },
  ],
  gastoIa: {
    tipo: "gasto",
    estado: "ok",
    mes: "2026-03",
    gastadoUsd: "0.0035",
    topeUsd: "10.00",
  },
};

function html(salud: Salud = SALUD): string {
  return renderToStaticMarkup(PanelSalud({ salud }));
}

/**
 * Las `key` de las filas (los elementos con el atributo `atributo`) del árbol
 * de React, sin renderizarlo a HTML: el render a texto del servidor no avisa de
 * claves repetidas, así que se mira la `key` que le pasa el componente. Los
 * componentes del panel son funciones puras (sin hooks): se expanden llamándolos.
 */
function clavesDeFilas(nodo: ReactNode, atributo: string): (string | null)[] {
  if (Array.isArray(nodo)) {
    return nodo.flatMap((hijo) => clavesDeFilas(hijo, atributo));
  }
  if (!isValidElement<{ children?: ReactNode }>(nodo)) {
    return [];
  }
  const propios = atributo in (nodo.props as object) ? [nodo.key] : [];
  if (typeof nodo.type === "function") {
    const expandido = (nodo.type as (props: object) => ReactNode)(nodo.props);
    return [...propios, ...clavesDeFilas(expandido, atributo)];
  }
  return [...propios, ...clavesDeFilas(nodo.props.children, atributo)];
}

/** El fragmento de una fila o recuadro, del atributo `data-*` a su cierre. */
function fragmento(marcado: string, atributo: string): string {
  const desde = marcado.indexOf(atributo);
  expect(desde, `no aparece ${atributo}`).toBeGreaterThan(-1);
  const cierres = [
    marcado.indexOf("</tr>", desde),
    marcado.indexOf("</section>", desde),
  ].filter((posicion) => posicion !== -1);
  return marcado.slice(desde, Math.min(...cierres));
}

describe("PanelSalud", () => {
  test("tiene las cuatro secciones, con su título", () => {
    const marcado = html();

    expect(marcado).toContain("<h1>Salud</h1>");
    for (const titulo of [
      "Jobs",
      "Fallidos pendientes",
      "Integraciones",
      "Gasto de IA del mes",
    ]) {
      expect(marcado, titulo).toContain(`<h2>${titulo}</h2>`);
    }
  });

  test("es HTML del servidor: ni scripts ni recarga automática", () => {
    const marcado = html();

    expect(marcado).not.toMatch(/<script/i);
    expect(marcado).not.toMatch(/http-equiv/i);
  });

  describe("jobs", () => {
    test("cada job dice hace cuánto corrió y su resultado, verde o rojo", () => {
      const latido = fragmento(html(), 'data-job="latido"');

      expect(latido).toContain('data-estado="ok"');
      expect(latido).toContain(">VERDE<");
      expect(latido).not.toContain(">ROJO<");
      expect(latido).toContain("hace 3 min");
    });

    test("un job atrasado es rojo aunque su última corrida haya sido ok, y dice por qué", () => {
      const atrasado = fragmento(html(), 'data-job="atrasado"');

      expect(atrasado).toContain('data-estado="rojo"');
      expect(atrasado).toContain(">ROJO<");
      expect(atrasado).not.toContain(">VERDE<");
      expect(atrasado).toContain("hace 3 días");
      expect(atrasado).toContain("no corrió en el doble de su intervalo");
    });

    test("un job que nunca corrió es rojo y lo dice", () => {
      const nuevo = fragmento(html(), 'data-job="nuevo"');

      expect(nuevo).toContain('data-estado="rojo"');
      expect(nuevo).toContain(">ROJO<");
      expect(nuevo).toContain("nunca corrió");
    });

    test("un error muestra su código y descripción, sin la causa (puede traer datos)", () => {
      const roto = fragmento(html(), 'data-job="roto"');

      expect(roto).toContain(">ROJO<");
      expect(roto).toContain("INF-0001 · Falló algo");
      expect(roto).not.toContain("postgres://");
      expect(roto).not.toContain("secreto");
    });

    test("una corrida sin fin se ve en curso", () => {
      expect(fragmento(html(), 'data-job="en-curso"')).toContain("en curso");
    });
  });

  describe("fallidos", () => {
    test("muestra el total, y de cada uno origen, código y edad", () => {
      const marcado = html();

      expect(marcado).toContain("120");
      const primero = fragmento(marcado, 'data-fallido="0"');
      expect(primero).toContain("ingesta.correo");
      expect(primero).toContain("ING-0001");
      expect(primero).toContain("hace 2 días");
      expect(fragmento(marcado, 'data-fallido="1"')).toContain("hace 4 h");
    });

    test("dos fallidos con el mismo origen, código y edad son dos filas con `key` distinta (M-07)", () => {
      const repetido = {
        origen: "ingesta.correo",
        codigoError: "ING-0001",
        haceMs: DIA,
      };
      const salud: Salud = {
        ...SALUD,
        fallidosPendientes: 2,
        fallidos: [
          { id: "00000000-0000-4000-8000-0000000000a1", ...repetido },
          { id: "00000000-0000-4000-8000-0000000000a2", ...repetido },
        ],
      };

      expect(html(salud).match(/data-fallido="/g)).toHaveLength(2);
      const claves = clavesDeFilas(PanelSalud({ salud }), "data-fallido");
      expect(claves).toHaveLength(2);
      expect(new Set(claves).size).toBe(2);
      expect(claves).not.toContain(null);
    });

    test("sin pendientes, lo dice", () => {
      const marcado = html({ ...SALUD, fallidosPendientes: 0, fallidos: [] });

      expect(marcado).toContain("No hay fallidos pendientes");
    });

    test("si no se pudo leer, lo dice en vez de mostrar una lista vacía", () => {
      const marcado = html({
        ...SALUD,
        fallidosPendientes: null,
        fallidos: null,
      });

      expect(marcado).toContain("No se pudieron leer los fallidos");
      expect(marcado).not.toContain("No hay fallidos pendientes");
    });
  });

  describe("integraciones", () => {
    test("la que responde está en verde, con su última prueba exitosa", () => {
      const base = fragmento(html(), 'data-integracion="base"');

      expect(base).toContain('data-estado="ok"');
      expect(base).toContain(">VERDE<");
      expect(base).not.toContain(">ROJO<");
      expect(base).toContain("2026-03-10 12:00:00");
    });

    test("la que no responde está en rojo con su código, y la última exitosa sigue a la vista", () => {
      const almacen = fragmento(html(), 'data-integracion="almacen"');

      expect(almacen).toContain('data-estado="rojo"');
      expect(almacen).toContain(">ROJO<");
      expect(almacen).not.toContain(">VERDE<");
      expect(almacen).toContain("INF-0001 · Falló algo inesperado");
      expect(almacen).toContain("2026-03-09 08:30:00");
      expect(almacen).toContain("hace 1 día");
    });

    test("sin prueba exitosa desde que arrancó, lo dice", () => {
      expect(fragmento(html(), 'data-integracion="correo"')).toContain(
        "sin prueba exitosa desde que arrancó la app",
      );
    });
  });

  describe("gasto de IA", () => {
    test("en verde: el mes, lo gastado y el tope", () => {
      const gasto = fragmento(html(), "data-gasto-ia");

      expect(gasto).toContain('data-estado="ok"');
      expect(gasto).toContain(">VERDE<");
      expect(gasto).not.toContain(">ROJO<");
      expect(gasto).toContain("2026-03");
      expect(gasto).toContain("USD 0.0035");
      expect(gasto).toContain("USD 10.00");
    });

    test("en rojo cuando lo gastado alcanza el tope", () => {
      const gasto = fragmento(
        html({
          ...SALUD,
          gastoIa: {
            tipo: "gasto",
            estado: "rojo",
            mes: "2026-03",
            gastadoUsd: "10.00",
            topeUsd: "10.00",
          },
        }),
        "data-gasto-ia",
      );

      expect(gasto).toContain('data-estado="rojo"');
      expect(gasto).toContain(">ROJO<");
      expect(gasto).not.toContain(">VERDE<");
    });

    test("si no se pudo calcular dice el código, y el resto del panel se ve igual", () => {
      const marcado = html({
        ...SALUD,
        gastoIa: { tipo: "error", detalle: "INF-0001 · Falta el tope" },
      });

      const gasto = fragmento(marcado, "data-gasto-ia");
      expect(gasto).toContain("INF-0001 · Falta el tope");
      expect(gasto).toContain(">ROJO<");
      expect(marcado).toContain('data-job="latido"');
      expect(marcado).toContain('data-integracion="base"');
    });
  });
});
