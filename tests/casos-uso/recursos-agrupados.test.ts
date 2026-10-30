/**
 * Lo que se ve de los recursos de un servicio (F6-02): *Humanos* y *Materiales*,
 * cada uno con sus filas. Datos inventados.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { RecursosAgrupados } from "../../src/app/servicios/_piezas/recursos-agrupados.tsx";
import type { DetalleDePlanificacion } from "../../src/casos-uso/servicios/planificacion.ts";

const ACCIONES = {
  cargar: async () => ({ escrito: {}, errores: {} }),
  quitar: async () => undefined,
};

function textoDe(recursos: DetalleDePlanificacion["recursos"]): string {
  const detalle: DetalleDePlanificacion = {
    hitos: [],
    recursos,
    plantillas: [],
    planificable: true,
    tildable: false,
  };
  const html = renderToStaticMarkup(
    createElement(RecursosAgrupados, {
      servicioId: "servicio-de-ejemplo",
      detalle,
      acciones: ACCIONES,
      ruta: "/servicios/servicio-de-ejemplo",
      puedeEscribir: true,
      parametros: {},
    }),
  );
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

const persona = {
  id: "uno",
  tipo: "Persona",
  detalle: "Operador de ejemplo",
  grupo: "humanos",
  cantidad: "",
  desde: "",
  hasta: "",
} as const;
const material = {
  id: "dos",
  tipo: "Material",
  detalle: "Cable de ejemplo",
  grupo: "materiales",
  cantidad: "20 metros",
  desde: "",
  hasta: "",
} as const;

describe("recursos agrupados", () => {
  test("las personas van en «Humanos» y lo demás en «Materiales», con su cantidad", () => {
    const texto = textoDe([persona, material]);
    const humanos = texto.indexOf("Humanos");
    const materiales = texto.indexOf("Materiales");
    expect(humanos).toBeGreaterThan(-1);
    expect(materiales).toBeGreaterThan(humanos);
    expect(texto.slice(humanos, materiales)).toContain("Operador de ejemplo");
    expect(texto.slice(materiales)).toContain("Cable de ejemplo 20 metros");
  });

  test("un grupo sin recursos no se muestra", () => {
    const texto = textoDe([persona]);
    expect(texto).toContain("Humanos");
    expect(texto).not.toContain("Materiales");
  });
});
