import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  formatearUsd,
  parsearUsd,
} from "../../src/dominio/compartido/micro-usd.ts";
import { propiedad } from "./_arnes/propiedad.ts";

/**
 * F0-28 (R5) · Costos de IA en micro-dólares. El `Importe` de F0-20 trabaja en
 * centavos y no alcanza para el costo de unos tokens: los montos de IA son
 * micro-dólares enteros (`bigint`) y en `configuracion` se escriben como texto
 * decimal con punto (`"20.00"`, `"0.015"`). Ida y vuelta exacta, y rechazo de
 * más de seis decimales, negativos y texto que no es un número.
 */

const microUsdArbitrarios = fc.bigInt({ min: 0n, max: 10n ** 15n });

describe("parsearUsd", () => {
  it.each([
    ["20.00", 20_000_000n],
    ["0.015", 15_000n],
    ["0", 0n],
    ["5", 5_000_000n],
    ["0.000001", 1n],
    ["123.456789", 123_456_789n],
    ["007.5", 7_500_000n],
  ])("lee %s como %s micro-dólares", (texto, esperado) => {
    expect(parsearUsd(texto)).toEqual({ ok: true, valor: esperado });
  });

  it.each([
    ["0.0000001", "demasiados-decimales"],
    ["1.1234567", "demasiados-decimales"],
    ["-1", "negativo"],
    ["-0.50", "negativo"],
    ["", "no-numerico"],
    ["abc", "no-numerico"],
    ["1,50", "no-numerico"],
    [" 1.50", "no-numerico"],
    ["1.", "no-numerico"],
    [".5", "no-numerico"],
    ["1e3", "no-numerico"],
    ["+1", "no-numerico"],
    ["USD 1", "no-numerico"],
  ])("rechaza %j (%s)", (texto, motivo) => {
    expect(parsearUsd(texto)).toEqual({
      ok: false,
      error: { motivo, texto },
    });
  });

  it("propiedad: más de seis decimales siempre se rechaza, nunca se redondea", () => {
    propiedad(
      fc.nat(),
      fc.stringMatching(/^[0-9]{7,12}$/),
      (enteros, decimales) => {
        const resultado = parsearUsd(`${enteros}.${decimales}`);
        return (
          !resultado.ok && resultado.error.motivo === "demasiados-decimales"
        );
      },
    );
  });

  it("propiedad: un negativo siempre se rechaza", () => {
    propiedad(microUsdArbitrarios, (micro) => {
      const resultado = parsearUsd(`-${formatearUsd(micro)}`);
      return !resultado.ok && resultado.error.motivo === "negativo";
    });
  });

  it("propiedad: un texto que no es dígitos con punto decimal opcional se rechaza", () => {
    propiedad(
      fc.string().filter((texto) => !/^-?[0-9]+(\.[0-9]+)?$/.test(texto)),
      (texto) => {
        const resultado = parsearUsd(texto);
        return !resultado.ok && resultado.error.motivo === "no-numerico";
      },
    );
  });
});

describe("formatearUsd", () => {
  it.each([
    [20_000_000n, "20.00"],
    [15_000n, "0.015"],
    [0n, "0.00"],
    [1n, "0.000001"],
    [1_500_000n, "1.50"],
    [123_456_789n, "123.456789"],
  ])("escribe %s micro-dólares como %s", (micro, esperado) => {
    expect(formatearUsd(micro)).toBe(esperado);
  });

  it("propiedad: ida y vuelta exacta (formatear y volver a leer da el mismo entero)", () => {
    propiedad(microUsdArbitrarios, (micro) => {
      const resultado = parsearUsd(formatearUsd(micro));
      return resultado.ok && resultado.valor === micro;
    });
  });

  it("propiedad: vuelta e ida (leer y volver a escribir no cambia el valor)", () => {
    propiedad(
      fc.nat(),
      fc.stringMatching(/^[0-9]{1,6}$/),
      (enteros, decimales) => {
        const leido = parsearUsd(`${enteros}.${decimales}`);
        if (!leido.ok) {
          return false;
        }
        const releido = parsearUsd(formatearUsd(leido.valor));
        return releido.ok && releido.valor === leido.valor;
      },
    );
  });
});
