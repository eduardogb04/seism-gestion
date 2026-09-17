/**
 * F0-16: el caso de ejemplo del arnés de golden files. Un objeto fijo —datos
 * ficticios, el repo es público (regla 1 de AGENTS.md), sin fechas del
 * sistema— contra `golden/ejemplo.json`. Editar ese archivo a mano rompe este
 * test: es la demostración de que el arnés compara de verdad, no que solo
 * exista un archivo. Los casos reales de extracción de documentos son Fase 1.
 */

import { describe, it } from "vitest";
import { compararConGolden } from "./_arnes/golden.ts";

describe("ejemplo", () => {
  it("un objeto fijo coincide con su golden", () => {
    compararConGolden("ejemplo", {
      version: 1,
      servicio: "auditoria-anual",
      cliente: {
        nombre: "Cliente de Ejemplo SA",
        pais: "Argentina",
      },
      pasos: ["relevamiento", "trabajo-de-campo", "informe"],
    });
  });
});
