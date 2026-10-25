/**
 * Qué vence cuando termina un trabajo (F4-02, ADR 0045): uno por camión, y si no
 * hubo camiones uno por sitio, y si no hubo sitios uno por servicio. Datos
 * inventados.
 */

import { describe, expect, test } from "vitest";
import { objetivosDeVencimiento } from "../../src/dominio/servicios/vencimiento.ts";

const CAMION_A = {
  id: "camion-a",
  patenteTractor: "ZZ001ZZ",
  anioTractor: 2015,
  anioCisterna: null,
};
const CAMION_B = {
  id: "camion-b",
  patenteTractor: "ZZ002ZZ",
  anioTractor: 2020,
  anioCisterna: 2018,
};
const SITIO_A = { id: "sitio-a", nombre: "Planta Ejemplo Norte" };
const SITIO_B = { id: "sitio-b", nombre: "Planta Ejemplo Sur" };
const TITULO = "Auditoría de ejemplo";

describe("objetivosDeVencimiento", () => {
  test("con camiones, uno por camión, con su patente y sus años; los sitios no cuentan", () => {
    expect(
      objetivosDeVencimiento(TITULO, [CAMION_A, CAMION_B], [SITIO_A]),
    ).toEqual([
      {
        camionId: "camion-a",
        sitioId: null,
        descripcion: "Camión ZZ001ZZ",
        camion: { anioTractor: 2015, anioCisterna: null },
      },
      {
        camionId: "camion-b",
        sitioId: null,
        descripcion: "Camión ZZ002ZZ",
        camion: { anioTractor: 2020, anioCisterna: 2018 },
      },
    ]);
  });

  test("un camión repetido cuenta una sola vez", () => {
    expect(
      objetivosDeVencimiento(TITULO, [CAMION_A, CAMION_A], []),
    ).toHaveLength(1);
  });

  test("sin camiones y con sitios, uno por sitio, con su nombre", () => {
    expect(objetivosDeVencimiento(TITULO, [], [SITIO_A, SITIO_B])).toEqual([
      {
        camionId: null,
        sitioId: "sitio-a",
        descripcion: "Sitio Planta Ejemplo Norte",
        camion: null,
      },
      {
        camionId: null,
        sitioId: "sitio-b",
        descripcion: "Sitio Planta Ejemplo Sur",
        camion: null,
      },
    ]);
  });

  test("sin camiones ni sitios, uno por servicio, con su título", () => {
    expect(objetivosDeVencimiento(TITULO, [], [])).toEqual([
      {
        camionId: null,
        sitioId: null,
        descripcion: "Servicio Auditoría de ejemplo",
        camion: null,
      },
    ]);
  });
});
