/**
 * Lo que trae el formulario de alta de un ABM antes de que la persona escriba:
 * una casilla de sí/no puede venir marcada (F1-07, "activo" en Tipos de servicio).
 */

import { expect, test } from "vitest";
import { CLIENTES } from "../../src/casos-uso/abm/clientes.ts";
import { MARCADA, valoresDeAlta } from "../../src/casos-uso/abm/definicion.ts";
import { TIPOS_DE_SERVICIO } from "../../src/casos-uso/abm/tipos-de-servicio.ts";

test("el alta de un tipo de servicio trae «activo» marcado y nada más", () => {
  expect(valoresDeAlta(TIPOS_DE_SERVICIO)).toEqual({ activo: MARCADA });
});

test("una casilla que no pide venir marcada, viene vacía: el alta de un cliente no trae nada", () => {
  expect(valoresDeAlta(CLIENTES)).toEqual({});
});
