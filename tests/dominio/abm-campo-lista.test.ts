/**
 * El campo `lista` del molde de ABM (F6-02): de lo escrito (un texto por línea)
 * a los datos y de vuelta, y la definición de Plantillas de hitos que lo usa.
 */

import { expect, test } from "vitest";
import {
  escritoDe,
  textosDeLista,
  valorDeCampo,
} from "../../src/casos-uso/abm/definicion.ts";
import { PLANTILLAS_DE_HITOS } from "../../src/casos-uso/abm/plantillas-de-hitos.ts";

test("una lista escrita se recorta, descarta las líneas vacías y acepta saltos de línea de Windows", () => {
  expect(textosDeLista("  Uno \r\n\r\n Dos\n   \nTres")).toEqual([
    "Uno",
    "Dos",
    "Tres",
  ]);
  expect(textosDeLista("")).toEqual([]);
});

test("el valor de un campo lista es la lista de textos y la vuelta lo escribe uno por línea", () => {
  const campo = PLANTILLAS_DE_HITOS.campos.hitos;

  expect(valorDeCampo("hitos", campo, { hitos: "Uno\nDos" })).toEqual([
    "Uno",
    "Dos",
  ]);
  expect(
    escritoDe(PLANTILLAS_DE_HITOS, {
      nombre: "Plantilla de ejemplo",
      tipoServicioId: null,
      hitos: ["Uno", "Dos"],
    }),
  ).toEqual({
    nombre: "Plantilla de ejemplo",
    tipoServicioId: "",
    hitos: "Uno\nDos",
  });
});
