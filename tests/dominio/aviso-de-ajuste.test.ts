/**
 * F3-03 · El aviso que se lee antes de confirmar un ajuste de la cuota: la
 * ventana del ajuste de la pantalla del servicio, dibujada con el mes
 * propuesto, lo muestra al lado de los campos y del botón de confirmar.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { VentanaDeAjuste } from "../../src/app/servicios/[id]/facturacion.tsx";
import type { Escrito } from "../../src/casos-uso/abm/definicion.ts";
import { avisoDeAjuste } from "../../src/casos-uso/servicios/aviso-de-ajuste.ts";

// El formulario pide el router de Next: afuera de una página no hay uno montado.
vi.mock("next/navigation.js", () => ({ useRouter: () => ({ refresh() {} }) }));

function ventana(escrito: Escrito): string {
  const html = renderToStaticMarkup(
    createElement(VentanaDeAjuste, {
      servicioId: "uno",
      rutaAlCerrar: "/servicios/uno",
      formulario: {
        campos: [
          ["cuota", { tipo: "texto", etiqueta: "Cuota mensual sin IVA (ARS)" }],
          ["desde", { tipo: "fecha", etiqueta: "Rige desde" }],
        ],
        escrito,
      },
    }),
  );
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("el aviso del ajuste de la cuota", () => {
  test("dice desde qué mes vale y que no cambia lo ya devengado, antes del botón de confirmar", () => {
    const texto = ventana({ cuota: "150,00", desde: "2031-09-17" });
    const aviso =
      "El cambio vale desde septiembre de 2031 en adelante; no cambia lo ya devengado.";
    expect(texto).toContain(aviso);
    expect(texto.indexOf(aviso)).toBeLessThan(
      texto.indexOf("Confirmar ajuste"),
    );
  });

  test("sin un día elegido, avisa que el cambio vale de ese mes en adelante", () => {
    expect(ventana({ desde: "" })).toContain(
      "Elegí desde qué mes rige: el cambio vale de ese mes en adelante.",
    );
    expect(avisoDeAjuste("2031-02-30")).toBeNull();
    expect(avisoDeAjuste("2032-01-01")).toBe(
      "El cambio vale desde enero de 2032 en adelante; no cambia lo ya devengado.",
    );
  });
});
