import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  crearImporte,
  type Importe,
  MONEDAS,
  type Moneda,
} from "../../src/dominio/compartido/importe.ts";
import { avancePorMoneda } from "../../src/dominio/servicios/avance.ts";
import { propiedad } from "./_arnes/propiedad.ts";

/**
 * F2-07 · El avance de una orden de compra o de un servicio: por moneda y sin
 * convertir, el total (sin IVA), lo facturado (con IVA), lo cobrado y lo
 * pendiente de cobro. Montos inventados.
 */

const ars = (centavos: bigint) => crearImporte(centavos, "ARS");
const usd = (centavos: bigint) => crearImporte(centavos, "USD");

describe("avancePorMoneda: ejemplos", () => {
  it("una orden, una factura con IVA y un cobro parcial", () => {
    expect(
      avancePorMoneda(
        [ars(100_000n)],
        [{ total: ars(60_500n), cobrado: ars(20_000n) }],
      ),
    ).toEqual([
      {
        moneda: "ARS",
        total: ars(100_000n),
        facturado: ars(60_500n),
        cobrado: ars(20_000n),
        pendiente: ars(40_500n),
      },
    ]);
  });

  it("sin órdenes ni facturas no hay nada que mostrar", () => {
    expect(avancePorMoneda([], [])).toEqual([]);
  });

  it("las monedas no se mezclan: una factura en dólares es su propia línea", () => {
    const avance = avancePorMoneda(
      [ars(100_000n)],
      [
        { total: ars(10_000n), cobrado: ars(10_000n) },
        { total: usd(500n), cobrado: usd(0n) },
      ],
    );
    expect(avance.map(({ moneda }) => moneda)).toEqual(["ARS", "USD"]);
    expect(avance[1]).toEqual({
      moneda: "USD",
      total: usd(0n),
      facturado: usd(500n),
      cobrado: usd(0n),
      pendiente: usd(500n),
    });
  });
});

describe("avancePorMoneda: propiedades", () => {
  const importe = fc
    .tuple(fc.bigInt({ min: 0n, max: 10n ** 12n }), fc.constantFrom(...MONEDAS))
    .map(([centavos, moneda]) => crearImporte(centavos, moneda));
  const factura = fc
    .tuple(importe, fc.double({ min: 0, max: 1, noNaN: true }))
    .map(([total, parte]) => ({
      total,
      cobrado: crearImporte(
        BigInt(Math.floor(Number(total.centavos) * parte)),
        total.moneda,
      ),
    }));

  function suma(importes: readonly Importe<Moneda>[], moneda: Moneda): bigint {
    return importes
      .filter((i) => i.moneda === moneda)
      .reduce((total, i) => total + i.centavos, 0n);
  }

  it("pendiente = facturado − cobrado en cada moneda, y cada moneda suma solo lo suyo", () => {
    propiedad(
      fc.array(importe, { maxLength: 5 }),
      fc.array(factura, { maxLength: 5 }),
      (ordenes, facturas) => {
        const avance = avancePorMoneda(ordenes, facturas);
        return avance.every(
          (linea) =>
            linea.pendiente.centavos ===
              linea.facturado.centavos - linea.cobrado.centavos &&
            linea.total.centavos === suma(ordenes, linea.moneda) &&
            linea.facturado.centavos ===
              suma(
                facturas.map(({ total }) => total),
                linea.moneda,
              ) &&
            linea.cobrado.centavos ===
              suma(
                facturas.map(({ cobrado }) => cobrado),
                linea.moneda,
              ) &&
            [
              linea.total,
              linea.facturado,
              linea.cobrado,
              linea.pendiente,
            ].every((i) => i.moneda === linea.moneda),
        );
      },
    );
  });

  it("hay una línea por cada moneda que aparece, y ninguna de más", () => {
    propiedad(
      fc.array(importe, { maxLength: 5 }),
      fc.array(factura, { maxLength: 5 }),
      (ordenes, facturas) => {
        const aparecen = MONEDAS.filter((moneda) =>
          [...ordenes, ...facturas.map(({ total }) => total)].some(
            (i) => i.moneda === moneda,
          ),
        );
        return (
          JSON.stringify(
            avancePorMoneda(ordenes, facturas).map(({ moneda }) => moneda),
          ) === JSON.stringify(aparecen)
        );
      },
    );
  });
});
