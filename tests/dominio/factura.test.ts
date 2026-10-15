import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  crearImporte,
  type Importe,
  MONEDAS,
  type Moneda,
} from "../../src/dominio/compartido/importe.ts";
import {
  ALICUOTA_POR_DEFECTO,
  ALICUOTAS_IVA,
  type AlicuotaIva,
  ivaDe,
  totalConIva,
} from "../../src/dominio/servicios/factura.ts";
import { propiedad } from "./_arnes/propiedad.ts";

/**
 * F2-06 · El IVA y el total de una factura se calculan, no se guardan: una
 * sola función redondea, al centavo y con la mitad hacia arriba. Montos
 * inventados.
 */

const baseArbitraria: fc.Arbitrary<Importe<Moneda>> = fc.record({
  centavos: fc.bigInt({ min: 0n, max: 10n ** 13n }),
  moneda: fc.constantFrom(...MONEDAS),
});
const alicuotaArbitraria: fc.Arbitrary<AlicuotaIva> = fc.constantFrom(
  ...ALICUOTAS_IVA,
);

describe("las alícuotas", () => {
  it("son 21 %, 10,5 % y 0 %, en milésimas, y la de siempre es 21 %", () => {
    expect([...ALICUOTAS_IVA]).toEqual([210, 105, 0]);
    expect(ALICUOTA_POR_DEFECTO).toBe(210);
  });
});

describe("ivaDe: ejemplos", () => {
  it("21 % de 1.000,00 es 210,00", () => {
    expect(ivaDe(crearImporte(100_000n, "ARS"), 210)).toEqual(
      crearImporte(21_000n, "ARS"),
    );
  });

  it("10,5 % de 0,05 son 0,525 centavos y se redondea hacia arriba: 0,01", () => {
    expect(ivaDe(crearImporte(5n, "ARS"), 105)).toEqual(
      crearImporte(1n, "ARS"),
    );
  });

  it("la mitad exacta se redondea hacia arriba: 10,5 % de 1,00 y 21 % de 0,50 dan 10,5 centavos, 0,11", () => {
    expect(ivaDe(crearImporte(100n, "ARS"), 105).centavos).toBe(11n);
    expect(ivaDe(crearImporte(50n, "USD"), 210).centavos).toBe(11n);
  });

  it("10,5 % de 0,04 son 0,42 centavos y se redondea hacia abajo: 0,00", () => {
    expect(ivaDe(crearImporte(4n, "USD"), 105)).toEqual(
      crearImporte(0n, "USD"),
    );
  });

  it("21 % de 0,02 son 0,42 centavos: 0,00; de 0,03, 0,63: 0,01", () => {
    expect(ivaDe(crearImporte(2n, "ARS"), 210).centavos).toBe(0n);
    expect(ivaDe(crearImporte(3n, "ARS"), 210).centavos).toBe(1n);
  });

  it("el total con IVA de 1.000,00 al 10,5 % es 1.105,00, en la moneda de la base", () => {
    expect(totalConIva(crearImporte(100_000n, "USD"), 105)).toEqual(
      crearImporte(110_500n, "USD"),
    );
  });
});

describe("ivaDe y totalConIva: propiedades", () => {
  it("el total es la base más el IVA, exacto y sin un segundo redondeo", () => {
    propiedad(baseArbitraria, alicuotaArbitraria, (base, alicuota) => {
      const iva = ivaDe(base, alicuota);
      const total = totalConIva(base, alicuota);
      return (
        total.centavos === base.centavos + iva.centavos &&
        total.moneda === base.moneda
      );
    });
  });

  it("con 0 % el IVA es cero y el total es la base", () => {
    propiedad(
      baseArbitraria,
      (base) =>
        ivaDe(base, 0).centavos === 0n &&
        totalConIva(base, 0).centavos === base.centavos,
    );
  });

  it("el IVA nunca es negativo y no pasa de la base (la alícuota máxima es 21 %)", () => {
    propiedad(baseArbitraria, alicuotaArbitraria, (base, alicuota) => {
      const { centavos } = ivaDe(base, alicuota);
      return centavos >= 0n && centavos <= base.centavos;
    });
  });

  it("más base nunca da menos IVA", () => {
    propiedad(
      baseArbitraria,
      fc.bigInt({ min: 0n, max: 10n ** 9n }),
      alicuotaArbitraria,
      (base, extra, alicuota) => {
        const mayor = crearImporte(base.centavos + extra, base.moneda);
        return (
          ivaDe(mayor, alicuota).centavos >= ivaDe(base, alicuota).centavos
        );
      },
    );
  });

  it("el IVA difiere del exacto en no más de medio centavo", () => {
    propiedad(baseArbitraria, alicuotaArbitraria, (base, alicuota) => {
      const exactoPorMil = base.centavos * BigInt(alicuota);
      const iva = ivaDe(base, alicuota).centavos * 1000n;
      const diferencia =
        iva > exactoPorMil ? iva - exactoPorMil : exactoPorMil - iva;
      return diferencia <= 500n;
    });
  });
});
