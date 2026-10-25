import { describe, expect, it } from "vitest";
import {
  convertir,
  crearImporte,
  crearTipoDeCambio,
  type DatosTipoDeCambio,
  formatearImporte,
  type Moneda,
  type ValorTipoDeCambio,
} from "../../src/dominio/compartido/importe.ts";
import { crearFechaHora } from "../../src/dominio/compartido/reloj.ts";
import {
  convertirDeDocumento,
  sumarConvertidos,
} from "../../src/dominio/tablero/conversion.ts";

/**
 * F3-08 · Convertir cada documento con su tipo de cambio y recién después sumar.
 * Montos y cotizaciones inventados.
 */

const HOY = (() => {
  const resultado = crearFechaHora({
    anio: 2031,
    mes: 7,
    dia: 9,
    hora: 0,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
})();

const cambio = (numerador: bigint, denominador = 100n): ValorTipoDeCambio => ({
  numerador,
  denominador,
});
const dolares = (centavos: bigint) => crearImporte(centavos, "USD");
const pesos = (centavos: bigint) => crearImporte(centavos, "ARS");

describe("convertirDeDocumento", () => {
  it("un importe que ya está en la moneda pedida no necesita tipo de cambio", () => {
    expect(convertirDeDocumento(pesos(12_345n), "ARS", null, HOY)).toEqual(
      pesos(12_345n),
    );
    expect(convertirDeDocumento(dolares(500n), "USD", null, HOY)).toEqual(
      dolares(500n),
    );
  });

  it("dólares a pesos: multiplica por los pesos por dólar", () => {
    expect(
      convertirDeDocumento(dolares(10_000n), "ARS", cambio(100_050n), HOY),
    ).toEqual(pesos(10_005_000n));
  });

  it("pesos a dólares: divide por los pesos por dólar, half-up al centavo", () => {
    expect(
      convertirDeDocumento(pesos(100_050n), "USD", cambio(100_000n), HOY),
    ).toEqual(dolares(100n));
    // 1,50 centavos y 2,50 centavos: la mitad se aleja del cero.
    expect(
      convertirDeDocumento(pesos(150n), "USD", cambio(10_000n), HOY),
    ).toEqual(dolares(2n));
    expect(
      convertirDeDocumento(pesos(-150n), "USD", cambio(10_000n), HOY),
    ).toEqual(dolares(-2n));
  });

  it("en otra moneda y sin tipo de cambio no se convierte: devuelve null, no cero", () => {
    expect(convertirDeDocumento(dolares(500n), "ARS", null, HOY)).toBeNull();
    expect(convertirDeDocumento(pesos(500n), "USD", null, HOY)).toBeNull();
  });
});

describe("sumarConvertidos", () => {
  const montos = [
    { importe: dolares(10_000n), cambio: cambio(100_050n), cantidad: 1 },
    { importe: dolares(5_025n), cambio: cambio(110_010n), cantidad: 1 },
    { importe: dolares(1_000n), cambio: cambio(90_000n), cantidad: 1 },
  ];

  it("convierte cada documento con su tipo de cambio y después suma", () => {
    // 100.050,00 + 55.280,03 (5.528.002,5 centavos, redondea hacia arriba) + 9.000,00
    expect(formatearImporte(sumarConvertidos("ARS", montos, HOY))).toBe(
      "ARS 164.330,03",
    );
  });

  it("no da lo mismo que sumar y convertir con un tipo de cambio promedio", () => {
    const promedio = crearTipoDeCambio({
      de: "USD",
      a: "ARS",
      valor: cambio(100_020n),
      fecha: HOY,
      fuente: "promedio de ejemplo",
      cargadoPor: "prueba",
    } as DatosTipoDeCambio<"USD", "ARS">);
    if (!promedio.ok) {
      throw new Error("el promedio de ejemplo no es válido");
    }
    const sumaEnDolares = crearImporte(16_025n, "USD");

    expect(convertir(sumaEnDolares, promedio.valor).centavos).not.toBe(
      sumarConvertidos("ARS", montos, HOY).centavos,
    );
  });

  it("redondea cada documento y después multiplica por la cantidad de iguales", () => {
    const iguales = [
      { importe: dolares(1n), cambio: cambio(100_050n), cantidad: 3 },
    ];
    // 1.000,5 centavos por documento → 1.001; tres documentos → 3.003, no 3.002.
    expect(sumarConvertidos("ARS", iguales, HOY)).toEqual(pesos(3_003n));
  });

  it("los que no se pueden convertir quedan afuera de la suma", () => {
    const sinCambio = [
      ...montos,
      { importe: dolares(99_999n), cambio: null, cantidad: 2 },
      { importe: pesos(7_000n), cambio: null, cantidad: 1 },
    ];

    expect(sumarConvertidos("ARS", sinCambio, HOY)).toEqual(
      pesos(16_433_003n + 7_000n),
    );
  });

  it("la suma de nada es cero en la moneda pedida", () => {
    const moneda: Moneda = "USD";
    expect(sumarConvertidos(moneda, [], HOY)).toEqual(dolares(0n));
  });
});
