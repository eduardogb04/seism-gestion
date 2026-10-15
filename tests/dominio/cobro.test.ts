import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  crearImporte,
  type Importe,
  MONEDAS,
  type Moneda,
} from "../../src/dominio/compartido/importe.ts";
import {
  type CobroDeFactura,
  estaCobrada,
  saldoDeFactura,
} from "../../src/dominio/servicios/cobro.ts";
import { totalConIva } from "../../src/dominio/servicios/factura.ts";
import { configuracion } from "./_arnes/propiedad.ts";

/**
 * F2-07 · El saldo de una factura: lo que se cobró, lo que se retuvo y lo que
 * falta. Una retención cancela deuda igual que un cobro; la regla es la de
 * `saldo.ts`, no una segunda. Montos inventados.
 */

const TOPE = 10n ** 12n;
/** R4 pide al menos 1000 corridas también en local. */
function milCorridas<Ts>(): fc.Parameters<Ts> {
  return { ...configuracion<Ts>(), numRuns: 1000 };
}

const ars = (centavos: bigint) => crearImporte(centavos, "ARS");

function cobro(
  centavos: bigint,
  retencion: bigint | null = null,
  moneda: Moneda = "ARS",
): CobroDeFactura<Moneda> {
  return {
    importe: crearImporte(centavos, moneda),
    retencion: retencion === null ? null : crearImporte(retencion, moneda),
  };
}

function suma(importes: readonly Importe<Moneda>[]): bigint {
  return importes.reduce((total, { centavos }) => total + centavos, 0n);
}

/** Cada parte del total se reparte entre importe y retención (la retención puede ser toda). */
const cobrosQueCaben = (
  total: bigint,
  moneda: Moneda,
): fc.Arbitrary<CobroDeFactura<Moneda>[]> =>
  fc
    .tuple(
      fc.array(fc.bigInt({ min: 0n, max: total }), { maxLength: 8 }),
      fc.array(fc.integer({ min: 0, max: 1000 }), {
        minLength: 8,
        maxLength: 8,
      }),
    )
    .map(([cortes, razones]) => {
      const cobros: CobroDeFactura<Moneda>[] = [];
      let anterior = 0n;
      const ordenados = [...cortes].sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0,
      );
      for (const [indice, corte] of ordenados.entries()) {
        const aporte = corte - anterior;
        anterior = corte;
        if (aporte > 0n) {
          const retenido = (aporte * BigInt(razones[indice] ?? 0)) / 1000n;
          cobros.push(
            cobro(aporte - retenido, retenido === 0n ? null : retenido, moneda),
          );
        }
      }
      return cobros;
    });

describe("saldoDeFactura: ejemplos", () => {
  it("total 1210,00, cobro 1000,00 más retención 210,00: saldo cero y cobrada", () => {
    const resultado = saldoDeFactura(ars(121_000n), [cobro(100_000n, 21_000n)]);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) {
      return;
    }
    expect(resultado.valor.cobrado).toEqual(ars(100_000n));
    expect(resultado.valor.retenido).toEqual(ars(21_000n));
    expect(resultado.valor.saldo).toEqual(ars(0n));
    expect(estaCobrada(resultado.valor)).toBe(true);
  });

  it("sin cobros todo está pendiente y no está cobrada", () => {
    const resultado = saldoDeFactura(ars(50_000n), []);
    expect(resultado.ok && resultado.valor.saldo).toEqual(ars(50_000n));
    expect(resultado.ok && estaCobrada(resultado.valor)).toBe(false);
  });

  it("el total es el de la factura con IVA", () => {
    const total = totalConIva(ars(100_000n), 210);
    const resultado = saldoDeFactura(total, [cobro(50_000n)]);
    expect(resultado.ok && resultado.valor.saldo.centavos).toBe(71_000n);
  });

  it("cobrar de más se rechaza con DOM-0012, y la retención cuenta para pasarse", () => {
    expect(saldoDeFactura(ars(100_000n), [cobro(100_001n)])).toEqual({
      ok: false,
      error: { codigo: "DOM-0012", motivo: "supera-saldo" },
    });
    expect(saldoDeFactura(ars(100_000n), [cobro(90_000n, 10_001n)]).ok).toBe(
      false,
    );
  });

  it("un cobro de cero sin retención se rechaza", () => {
    expect(saldoDeFactura(ars(100n), [cobro(0n)])).toEqual({
      ok: false,
      error: { codigo: "DOM-0012", motivo: "no-positivo" },
    });
  });

  it("un cobro en otra moneda que la factura se rechaza", () => {
    expect(saldoDeFactura(ars(100n), [cobro(50n, null, "USD")])).toEqual({
      ok: false,
      error: { codigo: "DOM-0012", motivo: "otra-moneda" },
    });
  });
});

describe("saldoDeFactura: propiedades", () => {
  const casoQueCabe = fc
    .tuple(fc.bigInt({ min: 0n, max: TOPE }), fc.constantFrom(...MONEDAS))
    .chain(([centavos, moneda]) =>
      cobrosQueCaben(centavos, moneda).map((cobros) => ({
        total: crearImporte(centavos, moneda),
        cobros,
      })),
    );

  it("cobrado + retenido + saldo = total y el saldo nunca es negativo", () => {
    fc.assert(
      fc.property(casoQueCabe, ({ total, cobros }) => {
        const resultado = saldoDeFactura(total, cobros);
        if (!resultado.ok) {
          return false;
        }
        const { cobrado, retenido, saldo } = resultado.valor;
        return (
          cobrado.centavos === suma(cobros.map(({ importe }) => importe)) &&
          retenido.centavos ===
            suma(
              cobros.flatMap(({ retencion }) =>
                retencion === null ? [] : [retencion],
              ),
            ) &&
          cobrado.centavos + retenido.centavos + saldo.centavos ===
            total.centavos &&
          saldo.centavos >= 0n
        );
      }),
      milCorridas(),
    );
  });

  it("con cobros cualesquiera, o cierra la cuenta o se rechaza: nunca queda saldo negativo", () => {
    const cobroCualquiera = fc.record({
      importe: fc.bigInt({ min: -TOPE, max: TOPE }),
      retencion: fc.option(fc.bigInt({ min: 0n, max: TOPE }), { nil: null }),
    });
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: TOPE }),
        fc.array(cobroCualquiera, { maxLength: 6 }),
        (centavos, cobros) => {
          const resultado = saldoDeFactura(
            ars(centavos),
            cobros.map(({ importe, retencion }) => cobro(importe, retencion)),
          );
          return !resultado.ok || resultado.valor.saldo.centavos >= 0n;
        },
      ),
      milCorridas(),
    );
  });

  it("una retención sola puede saldar la factura", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: TOPE }),
        fc.constantFrom(...MONEDAS),
        (centavos, moneda) => {
          const resultado = saldoDeFactura(crearImporte(centavos, moneda), [
            cobro(0n, centavos, moneda),
          ]);
          return (
            resultado.ok &&
            estaCobrada(resultado.valor) &&
            resultado.valor.retenido.centavos === centavos &&
            resultado.valor.cobrado.centavos === 0n
          );
        },
      ),
      milCorridas(),
    );
  });
});
