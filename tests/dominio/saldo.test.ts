import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  convertir,
  crearImporte,
  crearTipoDeCambio,
  formatearValorTipoDeCambio,
  type Importe,
  MONEDAS,
  type Moneda,
  parsearValorTipoDeCambio,
} from "../../src/dominio/compartido/importe.ts";
import { crearFechaHora } from "../../src/dominio/compartido/reloj.ts";
import {
  importeEnCuenta,
  pagar,
  type Saldo,
  saldoDe,
} from "../../src/dominio/compartido/saldo.ts";
import { propiedad } from "./_arnes/propiedad.ts";

/**
 * F2-09 · La regla de saldo (un total y sus pagos parciales) y lo que sale de
 * la cuenta cuando su moneda no es la de la deuda. Genérica: la reutilizan los
 * cobros. Montos, fuentes y personas inventados.
 */

const DIA = (() => {
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

const monedaArbitraria: fc.Arbitrary<Moneda> = fc.constantFrom(...MONEDAS);
const TOPE = 10n ** 12n;
const totalArbitrario = fc.bigInt({ min: 0n, max: TOPE });
/** Pagos de cualquier signo y tamaño: la mayoría se rechaza, y eso también se prueba. */
const pagoArbitrario = fc.bigInt({ min: -TOPE, max: TOPE });

function sumaDe(importes: readonly Importe<Moneda>[]): bigint {
  return importes.reduce((suma, importe) => suma + importe.centavos, 0n);
}

describe("pagar: el saldo nunca es negativo y ningún centavo se pierde", () => {
  it("un total sin pagos está todo pendiente", () => {
    const resultado = saldoDe(crearImporte(10_000n, "USD"), []);
    expect(resultado).toEqual({
      ok: true,
      valor: {
        total: crearImporte(10_000n, "USD"),
        pagado: crearImporte(0n, "USD"),
        saldo: crearImporte(10_000n, "USD"),
      },
    });
  });

  it("dos pagos parciales dejan lo que falta, y el que salda deja cero", () => {
    const total = crearImporte(10_000n, "ARS");
    const parcial = saldoDe(total, [
      crearImporte(2_500n, "ARS"),
      crearImporte(4_000n, "ARS"),
    ]);
    expect(parcial.ok && parcial.valor.saldo.centavos).toBe(3_500n);

    const completo = saldoDe(total, [
      crearImporte(6_500n, "ARS"),
      crearImporte(3_500n, "ARS"),
    ]);
    expect(completo.ok && completo.valor.saldo.centavos).toBe(0n);
    expect(completo.ok && completo.valor.pagado.centavos).toBe(10_000n);
  });

  it("un pago mayor que el saldo se rechaza con DOM-0012 y el saldo no cambia", () => {
    const saldoAhora = saldoDe(crearImporte(10_000n, "ARS"), [
      crearImporte(9_000n, "ARS"),
    ]);
    if (!saldoAhora.ok) {
      throw new Error("el saldo inicial tendría que ser válido");
    }
    const resultado = pagar(saldoAhora.valor, crearImporte(1_001n, "ARS"));
    expect(resultado).toEqual({
      ok: false,
      error: { codigo: catalogo.DOM_0012.codigo, motivo: "supera-saldo" },
    });
  });

  it("un pago igual al saldo es válido (queda en cero)", () => {
    const resultado = saldoDe(crearImporte(10_000n, "ARS"), [
      crearImporte(10_000n, "ARS"),
    ]);
    expect(resultado.ok && resultado.valor.saldo.centavos).toBe(0n);
  });

  it.each([0n, -1n, -10_000n])(
    "un pago de %s centavos se rechaza con DOM-0012",
    (centavos) => {
      const resultado = saldoDe(crearImporte(10_000n, "ARS"), [
        crearImporte(centavos, "ARS"),
      ]);
      expect(resultado).toEqual({
        ok: false,
        error: { codigo: catalogo.DOM_0012.codigo, motivo: "no-positivo" },
      });
    },
  );

  it("un pago en otra moneda que la del total se rechaza: hay que convertirlo antes", () => {
    // Con la moneda resuelta en ejecución (la base, el formulario) el compilador no la distingue: la regla sí.
    const total: Importe<Moneda> = crearImporte(10_000n, "USD");
    const resultado = saldoDe(total, [crearImporte(100n, "ARS")]);
    expect(resultado).toEqual({
      ok: false,
      error: { codigo: catalogo.DOM_0012.codigo, motivo: "otra-moneda" },
    });
  });

  it("con cualquier secuencia de pagos: lo aceptado nunca pasa el total, pagado + saldo = total y un pago de más siempre se rechaza", () => {
    propiedad(
      monedaArbitraria,
      totalArbitrario,
      fc.array(pagoArbitrario, { maxLength: 30 }),
      (moneda, centavosTotal, pagos) => {
        const total = crearImporte(centavosTotal, moneda);
        const inicial = saldoDe(total, []);
        if (!inicial.ok) {
          return false;
        }
        let actual: Saldo<Moneda> = inicial.valor;
        const aceptados: Importe<Moneda>[] = [];
        for (const centavos of pagos) {
          const pago = crearImporte(centavos, moneda);
          const resultado = pagar(actual, pago);
          const deberiaAceptar =
            centavos > 0n && centavos <= actual.saldo.centavos;
          if (resultado.ok !== deberiaAceptar) {
            return false;
          }
          if (resultado.ok) {
            actual = resultado.valor;
            aceptados.push(pago);
          }
          const { pagado, saldo } = actual;
          if (
            saldo.centavos < 0n ||
            pagado.centavos > centavosTotal ||
            pagado.centavos + saldo.centavos !== centavosTotal ||
            pagado.centavos !== sumaDe(aceptados)
          ) {
            return false;
          }
        }
        // Volver a calcular desde cero con lo aceptado da lo mismo: el saldo no depende de cómo se llegó.
        const recalculado = saldoDe(total, aceptados);
        return (
          recalculado.ok &&
          recalculado.valor.saldo.centavos === actual.saldo.centavos
        );
      },
    );
  });
});

function datosDeCambio(texto: string) {
  const valor = parsearValorTipoDeCambio(texto);
  if (!valor.ok) {
    throw new Error("el tipo de cambio de prueba tiene que ser válido");
  }
  return {
    valor: valor.valor,
    fuente: "Fuente inventada",
    fecha: DIA,
    cargadoPor: "usuario-1",
  };
}

describe("importeEnCuenta: lo que sale de la cuenta", () => {
  it("monedas iguales y sin tipo de cambio: sale lo mismo", () => {
    const resultado = importeEnCuenta(
      crearImporte(12_345n, "ARS"),
      "ARS",
      null,
    );
    expect(resultado).toEqual({
      ok: true,
      valor: crearImporte(12_345n, "ARS"),
    });
  });

  it("monedas iguales con tipo de cambio: sobra, DOM-0013", () => {
    const resultado = importeEnCuenta(
      crearImporte(12_345n, "ARS"),
      "ARS",
      datosDeCambio("1.000"),
    );
    expect(resultado).toEqual({
      ok: false,
      error: { codigo: catalogo.DOM_0013.codigo, motivo: "sobra" },
    });
  });

  it("monedas distintas sin tipo de cambio: falta, DOM-0013", () => {
    const resultado = importeEnCuenta(
      crearImporte(12_345n, "USD"),
      "ARS",
      null,
    );
    expect(resultado).toEqual({
      ok: false,
      error: { codigo: catalogo.DOM_0013.codigo, motivo: "falta" },
    });
  });

  it("monedas distintas: usa convertir con el valor cargado (half-up al centavo)", () => {
    // USD 100,01 × 1.184,25 = ARS 118.436,8425 → 118.436,84
    const resultado = importeEnCuenta(
      crearImporte(10_001n, "USD"),
      "ARS",
      datosDeCambio("1.184,25"),
    );
    expect(resultado).toEqual({
      ok: true,
      valor: crearImporte(11_843_684n, "ARS"),
    });
  });

  it("la mitad exacta se redondea hacia arriba, como convertir", () => {
    // 1 centavo × 0,5 = 0,5 → 1
    const resultado = importeEnCuenta(
      crearImporte(1n, "USD"),
      "ARS",
      datosDeCambio("0,5"),
    );
    expect(resultado).toEqual({ ok: true, valor: crearImporte(1n, "ARS") });
  });

  it("una fuente en blanco se rechaza como tipo de cambio inválido (DOM-0004)", () => {
    const resultado = importeEnCuenta(crearImporte(100n, "USD"), "ARS", {
      ...datosDeCambio("1.184,25"),
      fuente: "   ",
    });
    expect(resultado).toEqual({
      ok: false,
      error: { codigo: catalogo.DOM_0004.codigo, campo: "fuente" },
    });
  });

  it("es exactamente convertir del dominio, en los dos sentidos", () => {
    propiedad(
      fc.bigInt({ min: 1n, max: 10n ** 12n }),
      fc.bigInt({ min: 1n, max: 10n ** 6n }),
      fc.bigInt({ min: 0n, max: 4n }),
      fc.boolean(),
      (centavos, numerador, decimales, deUsd) => {
        const denominador = 10n ** decimales;
        const de: Moneda = deUsd ? "USD" : "ARS";
        const a: Moneda = deUsd ? "ARS" : "USD";
        const cambio = {
          valor: { numerador, denominador },
          fuente: "Fuente inventada",
          fecha: DIA,
          cargadoPor: "usuario-1",
        };
        const resultado = importeEnCuenta(
          crearImporte(centavos, de),
          a,
          cambio,
        );
        const esperado = deUsd
          ? convertir(
              crearImporte(centavos, "USD"),
              tipoDe("USD", "ARS", cambio),
            )
          : convertir(
              crearImporte(centavos, "ARS"),
              tipoDe("ARS", "USD", cambio),
            );
        return (
          resultado.ok &&
          resultado.valor.centavos === esperado.centavos &&
          resultado.valor.moneda === a
        );
      },
    );
  });
});

function tipoDe<De extends Moneda, A extends Exclude<Moneda, De>>(
  de: De,
  a: A,
  cambio: ReturnType<typeof datosDeCambio>,
) {
  const creado = crearTipoDeCambio({ ...cambio, de, a });
  if (!creado.ok) {
    throw new Error("el tipo de cambio de prueba tiene que ser válido");
  }
  return creado.valor;
}

describe("formatearValorTipoDeCambio: como se escribe, se muestra", () => {
  it.each([
    ["1.184,25", "1.184,25"],
    ["1184,25", "1.184,25"],
    ["1000", "1.000"],
    ["0,5", "0,5"],
    ["1,2345", "1,2345"],
    ["12", "12"],
  ])("%s se muestra %s", (escrito, esperado) => {
    const leido = parsearValorTipoDeCambio(escrito);
    expect(leido.ok && formatearValorTipoDeCambio(leido.valor)).toBe(esperado);
  });

  it("vuelve a leerse igual (ida y vuelta)", () => {
    propiedad(
      fc.bigInt({ min: 1n, max: 10n ** 12n }),
      fc.bigInt({ min: 0n, max: 6n }),
      (numerador, decimales) => {
        const valor = { numerador, denominador: 10n ** decimales };
        const releido = parsearValorTipoDeCambio(
          formatearValorTipoDeCambio(valor),
        );
        return (
          releido.ok &&
          releido.valor.numerador * valor.denominador ===
            valor.numerador * releido.valor.denominador
        );
      },
    );
  });
});
