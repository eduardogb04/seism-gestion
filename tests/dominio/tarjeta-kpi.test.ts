/**
 * La tarjeta de un indicador (F3-05): título, valor ya formateado y, si hay,
 * la variación con su signo, su ícono y el color del tema que corresponde
 * (no solo el color: el signo y el ícono dicen lo mismo).
 */

import { Receipt } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { TarjetaKpi } from "../../src/app/_ui/tarjeta-kpi.tsx";

function sinEtiquetas(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

describe("TarjetaKpi", () => {
  test("muestra el título, el valor y el detalle, con el ícono oculto al lector de pantalla", () => {
    const html = renderToStaticMarkup(
      TarjetaKpi({
        titulo: "Facturado",
        valor: "ARS 1.234,50",
        detalle: "sin IVA",
        Icono: Receipt,
      }),
    );

    expect(sinEtiquetas(html)).toContain("Facturado");
    expect(sinEtiquetas(html)).toContain("ARS 1.234,50");
    expect(sinEtiquetas(html)).toContain("sin IVA");
    const icono = /<svg [^>]*>/.exec(html)?.[0];
    expect(icono).toContain("lucide-receipt");
    expect(icono).toContain('aria-hidden="true"');
    expect(html).toContain("bg-superficie");
  });

  test.each([
    [0.125, "+12,5%", "text-exito", "lucide-trending-up"],
    [-0.04, "-4%", "text-peligro", "lucide-trending-down"],
    [0, "0%", "text-texto-suave", "lucide-minus"],
  ])(
    "una variación de %d se ve como %s, con %s y su ícono",
    (variacion, texto, color, icono) => {
      const html = renderToStaticMarkup(
        TarjetaKpi({ titulo: "Cobrado", valor: "USD 10,00", variacion }),
      );

      const linea =
        /<p [^>]*data-variacion[^>]*>.*?<\/p>/.exec(html)?.[0] ?? "";
      expect(sinEtiquetas(linea)).toBe(texto);
      expect(linea).toContain(color);
      expect(linea).toContain(icono);
    },
  );

  test("sin variación no hay línea de variación", () => {
    const html = renderToStaticMarkup(
      TarjetaKpi({ titulo: "Cobrado", valor: "USD 10,00" }),
    );

    expect(html).not.toContain("data-variacion");
  });
});
