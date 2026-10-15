import { describe, expect, test } from "vitest";
import {
  etiquetaDeAlicuota,
  ivaYTotalEscritos,
  OPCIONES_DE_ALICUOTA,
} from "../../src/casos-uso/servicios/iva-de-factura.ts";

/**
 * F2-06 · Lo que se muestra al lado de los campos mientras se carga una
 * factura: el IVA y el total de lo escrito, con la cuenta del dominio. Montos
 * inventados.
 */

describe("ivaYTotalEscritos", () => {
  test("calcula con lo escrito, como lo escribe una persona (coma decimal, punto de miles)", () => {
    expect(
      ivaYTotalEscritos({
        importe: "1.000,00",
        importeMoneda: "ARS",
        alicuota: "210",
      }),
    ).toEqual({ iva: "ARS 210,00", total: "ARS 1.210,00" });
    expect(
      ivaYTotalEscritos({
        importe: "0,05",
        importeMoneda: "USD",
        alicuota: "105",
      }),
    ).toEqual({ iva: "USD 0,01", total: "USD 0,06" });
  });

  test("con 0 % el total es el importe", () => {
    expect(
      ivaYTotalEscritos({
        importe: "80,00",
        importeMoneda: "ARS",
        alicuota: "0",
      }),
    ).toEqual({ iva: "ARS 0,00", total: "ARS 80,00" });
  });

  test("mientras falta algo o está mal escrito, no hay cálculo", () => {
    const completo = {
      importe: "10,00",
      importeMoneda: "ARS",
      alicuota: "210",
    };

    expect(ivaYTotalEscritos({ ...completo, importe: "" })).toBeNull();
    expect(ivaYTotalEscritos({ ...completo, importe: "12abc" })).toBeNull();
    expect(ivaYTotalEscritos({ ...completo, importeMoneda: "" })).toBeNull();
    expect(ivaYTotalEscritos({ ...completo, alicuota: "270" })).toBeNull();
    expect(ivaYTotalEscritos({})).toBeNull();
  });
});

describe("las alícuotas que se ofrecen", () => {
  test("21 %, 10,5 % y 0 %, con el valor en milésimas", () => {
    expect(OPCIONES_DE_ALICUOTA).toEqual([
      { valor: "210", etiqueta: "21 %" },
      { valor: "105", etiqueta: "10,5 %" },
      { valor: "0", etiqueta: "0 %" },
    ]);
    expect(etiquetaDeAlicuota(105)).toBe("10,5 %");
  });
});
