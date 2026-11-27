import { describe, expect, it } from "vitest";
import { crearImporte } from "../../src/dominio/compartido/importe.ts";
import {
  type AjusteParaCuentas,
  descuentosAprobados,
  excesoDeDescuento,
  importeDeAjuste,
  quedaPorFacturar,
  saldoConDescuentos,
} from "../../src/dominio/servicios/ajuste-facturacion.ts";

/** R5 · El saldo de la orden con descuentos y cuándo queda algo por facturar. Montos inventados. */

const ars = (centavos: bigint) => crearImporte(centavos, "ARS");

function ajuste(
  clase: AjusteParaCuentas["clase"],
  estado: AjusteParaCuentas["estado"],
  centavos: bigint,
  facturado = false,
): AjusteParaCuentas {
  return { clase, estado, importe: ars(centavos), facturado };
}

describe("saldoConDescuentos", () => {
  it("resta del total los descuentos aprobados y lo facturado", () => {
    const aprobados = descuentosAprobados(
      [
        ajuste("descuento", "aprobado", 10_000n),
        ajuste("descuento", "pendiente", 50_000n),
        ajuste("descuento", "rechazado", 70_000n),
        ajuste("recargo", "aprobado", 90_000n),
      ],
      "ARS",
    );
    expect(saldoConDescuentos(ars(100_000n), aprobados, ars(60_000n))).toEqual(
      ars(30_000n),
    );
  });

  it("queda negativo si ya se facturó todo, y el exceso es lo de la nota de crédito", () => {
    const saldo = saldoConDescuentos(
      ars(100_000n),
      [ars(10_000n)],
      ars(100_000n),
    );
    expect(saldo).toEqual(ars(-10_000n));
    expect(excesoDeDescuento(saldo)).toEqual(ars(10_000n));
    expect(excesoDeDescuento(ars(5n))).toEqual(ars(0n));
  });
});

describe("quedaPorFacturar", () => {
  it("queda si el saldo es positivo", () => {
    expect(quedaPorFacturar(ars(1n), [])).toBe(true);
  });

  it("no queda con saldo cero o negativo y sin recargos", () => {
    expect(quedaPorFacturar(ars(0n), [])).toBe(false);
    expect(quedaPorFacturar(ars(-5n), [])).toBe(false);
  });

  it("queda con un recargo aprobado sin facturar, aunque el saldo sea cero", () => {
    expect(
      quedaPorFacturar(ars(0n), [ajuste("recargo", "aprobado", 100n)]),
    ).toBe(true);
    expect(
      quedaPorFacturar(ars(0n), [ajuste("recargo", "aprobado", 100n, true)]),
    ).toBe(false);
  });

  it("no cuentan los recargos pendientes ni rechazados", () => {
    expect(
      quedaPorFacturar(ars(0n), [
        ajuste("recargo", "pendiente", 100n),
        ajuste("recargo", "rechazado", 100n),
      ]),
    ).toBe(false);
  });

  it("sin orden solo cuentan los recargos", () => {
    expect(quedaPorFacturar(null, [])).toBe(false);
    expect(quedaPorFacturar(null, [ajuste("recargo", "aprobado", 1n)])).toBe(
      true,
    );
  });
});

describe("importeDeAjuste", () => {
  it("multiplica la cantidad por el precio unitario", () => {
    expect(importeDeAjuste("3 días", ars(2_000n), null)).toEqual(ars(6_000n));
  });

  it("usa el importe directo si no hay precio", () => {
    expect(importeDeAjuste("3 días", null, ars(7_000n))).toEqual(ars(7_000n));
    expect(importeDeAjuste(null, null, null)).toBeNull();
  });

  it("con precio y sin cantidad numérica no hay importe", () => {
    expect(importeDeAjuste("varios", ars(2_000n), null)).toBeNull();
  });
});
