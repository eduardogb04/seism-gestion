import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  crearImporte,
  type Importe,
  MONEDAS,
  type Moneda,
} from "../../src/dominio/compartido/importe.ts";
import { saldoDeOrden } from "../../src/dominio/servicios/orden-compra.ts";
import { propiedad } from "./_arnes/propiedad.ts";

/**
 * F2-06 · Lo facturado y el saldo por facturar de una orden de compra, siempre
 * sobre importes sin IVA. Una factura en otra moneda no suma: nada se convierte.
 * Montos inventados.
 */

type Factura = { readonly numero: string; readonly importe: Importe<Moneda> };

function factura(numero: string, centavos: bigint, moneda: Moneda): Factura {
  return { numero, importe: crearImporte(centavos, moneda) };
}

const monedaArbitraria = fc.constantFrom(...MONEDAS);
const facturaArbitraria: fc.Arbitrary<Factura> = fc.record({
  numero: fc.string({ minLength: 1, maxLength: 6 }),
  importe: fc.record({
    centavos: fc.bigInt({ min: 1n, max: 10n ** 10n }),
    moneda: monedaArbitraria,
  }),
});
const totalArbitrario = fc.bigInt({ min: 1n, max: 10n ** 11n });

describe("saldoDeOrden: ejemplos", () => {
  const total = crearImporte(1_000_000n, "ARS");

  it("sin facturas, todo está por facturar", () => {
    expect(saldoDeOrden(total, [])).toEqual({
      total,
      facturado: crearImporte(0n, "ARS"),
      saldo: total,
      otraMoneda: [],
    });
  });

  it("dos facturas parciales en la moneda de la orden bajan el saldo", () => {
    const resultado = saldoDeOrden(total, [
      factura("A-1", 400_000n, "ARS"),
      factura("A-2", 250_000n, "ARS"),
    ]);
    expect(resultado.facturado).toEqual(crearImporte(650_000n, "ARS"));
    expect(resultado.saldo).toEqual(crearImporte(350_000n, "ARS"));
  });

  it("facturar de más deja un saldo negativo, no un error", () => {
    const resultado = saldoDeOrden(total, [factura("A-1", 1_200_000n, "ARS")]);
    expect(resultado.saldo).toEqual(crearImporte(-200_000n, "ARS"));
  });

  it("una factura en otra moneda no suma y se devuelve aparte, sin convertir", () => {
    const enDolares = factura("A-3", 999_999n, "USD");
    const resultado = saldoDeOrden(total, [
      factura("A-1", 100_000n, "ARS"),
      enDolares,
    ]);
    expect(resultado.facturado).toEqual(crearImporte(100_000n, "ARS"));
    expect(resultado.saldo).toEqual(crearImporte(900_000n, "ARS"));
    expect(resultado.otraMoneda).toEqual([enDolares]);
  });
});

describe("saldoDeOrden: propiedades", () => {
  it("lo facturado es la suma de las facturas de la moneda de la orden, y el saldo es el total menos eso", () => {
    propiedad(
      totalArbitrario,
      monedaArbitraria,
      fc.array(facturaArbitraria, { maxLength: 8 }),
      (centavos, moneda, facturas) => {
        const resultado = saldoDeOrden(
          crearImporte(centavos, moneda),
          facturas,
        );
        const suma = facturas
          .filter(({ importe }) => importe.moneda === moneda)
          .reduce((acumulado, { importe }) => acumulado + importe.centavos, 0n);
        return (
          resultado.facturado.centavos === suma &&
          resultado.saldo.centavos === centavos - suma &&
          resultado.facturado.moneda === moneda &&
          resultado.saldo.moneda === moneda
        );
      },
    );
  });

  it("las facturas de otra moneda nunca cambian el saldo y todas quedan aparte", () => {
    propiedad(
      totalArbitrario,
      monedaArbitraria,
      fc.array(facturaArbitraria, { maxLength: 8 }),
      (centavos, moneda, facturas) => {
        const total = crearImporte(centavos, moneda);
        const ajenas = facturas.filter(
          ({ importe }) => importe.moneda !== moneda,
        );
        const propias = facturas.filter(
          ({ importe }) => importe.moneda === moneda,
        );
        const resultado = saldoDeOrden(total, facturas);
        return (
          resultado.saldo.centavos ===
            saldoDeOrden(total, propias).saldo.centavos &&
          resultado.otraMoneda.length === ajenas.length
        );
      },
    );
  });

  it("agregar una factura de la misma moneda baja el saldo exactamente en su importe", () => {
    propiedad(
      totalArbitrario,
      monedaArbitraria,
      fc.array(facturaArbitraria, { maxLength: 8 }),
      fc.bigInt({ min: 1n, max: 10n ** 10n }),
      (centavos, moneda, facturas, nueva) => {
        const total = crearImporte(centavos, moneda);
        const antes = saldoDeOrden(total, facturas).saldo.centavos;
        const despues = saldoDeOrden(total, [
          ...facturas,
          factura("N", nueva, moneda),
        ]).saldo.centavos;
        return antes - despues === nueva;
      },
    );
  });
});
