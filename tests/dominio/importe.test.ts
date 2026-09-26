import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatearMonto } from "../../src/app/formato/importe.ts";
import {
  CODIGO_PARTES_INVALIDAS,
  CODIGO_TEXTO_INVALIDO,
  CODIGO_TIPO_DE_CAMBIO_INVALIDO,
  convertir,
  crearImporte,
  crearTipoDeCambio,
  type DatosTipoDeCambio,
  type Importe,
  MONEDAS,
  type Moneda,
  multiplicar,
  parsearImporte,
  parsearValorTipoDeCambio,
  repartir,
  restar,
  sumar,
  type TipoDeCambio,
} from "../../src/dominio/compartido/importe.ts";
import {
  crearFechaHora,
  type FechaHora,
} from "../../src/dominio/compartido/reloj.ts";
import { propiedad } from "./_arnes/propiedad.ts";

/**
 * F0-20 · Importe con moneda y tipo de cambio (DISENO sección 2, decisión 1;
 * P5). Tres bloques: aritmética en centavos (con los tests de tipos que hacen
 * imposible sumar monedas distintas), tipo de cambio y conversión half-up, y
 * parseo del texto que escribe el usuario. Montos, fuentes y usuarios son
 * ficticios. Ver `docs/adr/0018-importes.md`.
 */

const CENTAVOS_MAXIMOS = 10n ** 15n;

const centavosArbitrarios: fc.Arbitrary<bigint> = fc.bigInt({
  min: -CENTAVOS_MAXIMOS,
  max: CENTAVOS_MAXIMOS,
});

/**
 * Totales con los tres casos a la vista (R5/R8 de la ficha): el cero, negativos
 * y positivos, además de los que fast-check elija en todo el rango.
 */
const centavosConBordes: fc.Arbitrary<bigint> = fc.oneof(
  fc.constant(0n),
  fc.bigInt({ min: -CENTAVOS_MAXIMOS, max: -1n }),
  fc.bigInt({ min: 1n, max: CENTAVOS_MAXIMOS }),
  centavosArbitrarios,
);

const monedaArbitraria: fc.Arbitrary<Moneda> = fc.constantFrom(...MONEDAS);

function fechaDePrueba(): FechaHora {
  const resultado = crearFechaHora({
    anio: 2026,
    mes: 3,
    dia: 2,
    hora: 10,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
}

const USUARIO_FICTICIO = "usuaria-de-prueba";

function datosTipoDeCambio<De extends Moneda, A extends Exclude<Moneda, De>>(
  de: De,
  a: A,
  numerador: bigint,
  denominador: bigint,
): DatosTipoDeCambio<De, A> {
  return {
    de,
    a,
    valor: { numerador, denominador },
    fecha: fechaDePrueba(),
    fuente: "Cotización de prueba",
    cargadoPor: USUARIO_FICTICIO,
  };
}

function tipoDeCambio<De extends Moneda, A extends Exclude<Moneda, De>>(
  de: De,
  a: A,
  numerador: bigint,
  denominador: bigint,
): TipoDeCambio<De, A> {
  const resultado = crearTipoDeCambio(
    datosTipoDeCambio(de, a, numerador, denominador),
  );
  if (!resultado.ok) {
    throw new Error(resultado.error.codigo);
  }
  return resultado.valor;
}

function absoluto(valor: bigint): bigint {
  return valor < 0n ? -valor : valor;
}

describe("Importe<M>: monedas distintas no se mezclan (tipos)", () => {
  it("sumar dos importes de la misma moneda compila y suma", () => {
    const a: Importe<"ARS"> = crearImporte(150n, "ARS");
    const b: Importe<"ARS"> = crearImporte(275n, "ARS");

    expect(sumar(a, b)).toEqual({ centavos: 425n, moneda: "ARS" });
  });

  it("sumar ARS con USD no compila", () => {
    const pesos: Importe<"ARS"> = crearImporte(100n, "ARS");
    const dolares: Importe<"USD"> = crearImporte(100n, "USD");

    // @ts-expect-error sumar(a: Importe<'ARS'>, b: Importe<'USD'>) no compila.
    sumar(pesos, dolares);
    // @ts-expect-error tampoco en el otro orden.
    sumar(dolares, pesos);
    // @ts-expect-error restar tiene la misma regla.
    restar(pesos, dolares);
  });

  it("un importe de moneda no resuelta (Importe<Moneda>) no entra a la aritmética sin decidir cuál es", () => {
    const cualquiera: Importe<Moneda> = crearImporte(100n, "ARS");

    // @ts-expect-error la moneda tiene que ser una sola, conocida en compilación.
    sumar(cualquiera, cualquiera);
  });

  it("un importe no se asigna a otra moneda", () => {
    const pesos = crearImporte(100n, "ARS");

    // @ts-expect-error un Importe<'ARS'> no es un Importe<'USD'>.
    const dolares: Importe<"USD"> = pesos;

    expect(dolares.moneda).toBe("ARS");
  });

  it("el importe creado está congelado", () => {
    expect(Object.isFrozen(crearImporte(1n, "USD"))).toBe(true);
  });
});

describe("aritmética en centavos", () => {
  it("resta", () => {
    expect(
      restar(crearImporte(100n, "USD"), crearImporte(250n, "USD")),
    ).toEqual({ centavos: -150n, moneda: "USD" });
  });

  it("multiplica por una cantidad entera", () => {
    expect(multiplicar(crearImporte(2_431_500n, "ARS"), 3n)).toEqual({
      centavos: 7_294_500n,
      moneda: "ARS",
    });
  });

  it.each([
    [100n, 3, [34n, 33n, 33n]],
    [-100n, 3, [-34n, -33n, -33n]],
    [2n, 5, [1n, 1n, 0n, 0n, 0n]],
    [0n, 2, [0n, 0n]],
    [999n, 1, [999n]],
  ])("reparte %s centavos en %s partes: %s", (centavos, partes, esperado) => {
    const resultado = repartir(crearImporte(centavos, "ARS"), partes);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.valor.map((parte) => parte.centavos)).toEqual(esperado);
      expect(resultado.valor.every((parte) => parte.moneda === "ARS")).toBe(
        true,
      );
    }
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "rechaza repartir en %s partes",
    (partes) => {
      const resultado = repartir(crearImporte(100n, "ARS"), partes);

      expect(resultado).toEqual({
        ok: false,
        error: { codigo: CODIGO_PARTES_INVALIDAS, partes },
      });
    },
  );

  it("propiedad: sumar y restar lo mismo devuelve el original", () => {
    propiedad(centavosArbitrarios, centavosArbitrarios, (a, b) => {
      const original = crearImporte(a, "USD");
      const otro = crearImporte(b, "USD");

      expect(restar(sumar(original, otro), otro)).toEqual(original);
    });
  });

  it("propiedad: repartir no pierde ni inventa centavos, y ninguna parte difiere de otra en más de un centavo", () => {
    propiedad(
      centavosConBordes,
      fc.integer({ min: 1, max: 500 }),
      monedaArbitraria,
      (centavos, partes, moneda) => {
        const total = crearImporte(centavos, moneda);
        const resultado = repartir(total, partes);

        expect(resultado.ok).toBe(true);
        if (!resultado.ok) {
          return;
        }
        const montos = resultado.valor.map((parte) => parte.centavos);

        expect(montos).toHaveLength(partes);
        expect(montos.reduce((suma, monto) => suma + monto, 0n)).toBe(centavos);
        const mayor = montos.reduce((a, b) => (a > b ? a : b));
        const menor = montos.reduce((a, b) => (a < b ? a : b));
        expect(mayor - menor <= 1n).toBe(true);
      },
    );
  });
});

describe("TipoDeCambio y convertir", () => {
  it("convierte con el valor exacto y redondea half-up al centavo", () => {
    // USD 24.315,00 a 1.184,25 ARS por USD.
    const tc = tipoDeCambio("USD", "ARS", 118_425n, 100n);

    expect(convertir(crearImporte(2_431_500n, "USD"), tc)).toEqual({
      centavos: 2_879_503_875n,
      moneda: "ARS",
    });
  });

  it.each([
    // centavos · numerador/denominador · esperado
    [1n, 1n, 2n, 1n], // 0,5 → 1 (la mitad sube)
    [3n, 1n, 2n, 2n], // 1,5 → 2
    [1n, 49n, 100n, 0n], // 0,49 → 0
    [1n, 51n, 100n, 1n], // 0,51 → 1
    [-1n, 1n, 2n, -1n], // -0,5 → -1 (simétrico: la mitad se aleja del cero)
    [-3n, 1n, 2n, -2n], // -1,5 → -2
    [-1n, 49n, 100n, 0n], // -0,49 → 0
    [1n, 4_999n, 10_000n, 0n], // 0,4999 → 0
    [1n, 5_001n, 10_000n, 1n], // 0,5001 → 1
    [-1n, 4_999n, 10_000n, 0n], // -0,4999 → 0
    [-1n, 5_001n, 10_000n, -1n], // -0,5001 → -1
    [5n, 3n, 10n, 2n], // 1,5 → 2 con otro denominador
    [-5n, 3n, 10n, -2n], // -1,5 → -2
  ])(
    "%s centavos × %s/%s = %s (half-up)",
    (centavos, numerador, denominador, esperado) => {
      const tc = tipoDeCambio("ARS", "USD", numerador, denominador);

      expect(convertir(crearImporte(centavos, "ARS"), tc).centavos).toBe(
        esperado,
      );
    },
  );

  it("convertir exige que el importe esté en la moneda de origen del TC (tipos)", () => {
    const tc = tipoDeCambio("USD", "ARS", 1_184n, 1n);
    const pesos = crearImporte(100n, "ARS");

    // @ts-expect-error un TC de USD a ARS no convierte pesos.
    convertir(pesos, tc);

    const convertido: Importe<"ARS"> = convertir(crearImporte(1n, "USD"), tc);
    // @ts-expect-error el resultado está en la moneda de destino, no en la de origen.
    const enDolares: Importe<"USD"> = convertido;

    expect(enDolares.moneda).toBe("ARS");
  });

  it("un TC no se fabrica a mano: solo crearTipoDeCambio lo produce (tipos)", () => {
    // @ts-expect-error un objeto con la misma forma no es un TipoDeCambio.
    const aMano: TipoDeCambio<"USD", "ARS"> = datosTipoDeCambio(
      "USD",
      "ARS",
      1n,
      1n,
    );

    expect(aMano.de).toBe("USD");
  });

  it("no existe un TC de una moneda a sí misma, así que convertir ARS a ARS no compila (tipos)", () => {
    // @ts-expect-error TipoDeCambio<'ARS', 'ARS'> no es un tipo válido.
    const aSiMisma: TipoDeCambio<"ARS", "ARS"> | null = null;

    expect(aSiMisma).toBeNull();
  });

  it("guarda de, a, valor, fecha, fuente y quién lo cargó, y queda congelado", () => {
    const datos = datosTipoDeCambio("USD", "ARS", 118_425n, 100n);
    const resultado = crearTipoDeCambio(datos);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.valor).toEqual(datos);
      expect(Object.isFrozen(resultado.valor)).toBe(true);
      expect(Object.isFrozen(resultado.valor.valor)).toBe(true);
    }
  });

  it.each([
    [0n, 1n],
    [-1_184n, 1n],
    [1_184n, 0n],
    [1_184n, -1n],
  ])(
    "rechaza el valor %s/%s (tiene que ser positivo)",
    (numerador, denominador) => {
      const resultado = crearTipoDeCambio(
        datosTipoDeCambio("USD", "ARS", numerador, denominador),
      );

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error).toEqual({
          codigo: CODIGO_TIPO_DE_CAMBIO_INVALIDO,
          campo: "valor",
        });
      }
    },
  );

  it("rechaza un TC sin fuente", () => {
    const resultado = crearTipoDeCambio({
      ...datosTipoDeCambio("USD", "ARS", 1_184n, 1n),
      fuente: "   ",
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).toEqual({
        codigo: CODIGO_TIPO_DE_CAMBIO_INVALIDO,
        campo: "fuente",
      });
    }
  });

  it("rechaza un TC sin quién lo cargó", () => {
    const resultado = crearTipoDeCambio({
      ...datosTipoDeCambio("USD", "ARS", 1_184n, 1n),
      cargadoPor: " ",
    });

    expect(resultado).toEqual({
      ok: false,
      error: { codigo: CODIGO_TIPO_DE_CAMBIO_INVALIDO, campo: "cargadoPor" },
    });
  });

  it.each([
    ["1184,25", 118_425n, 100n],
    ["1.184,2", 11_842n, 10n],
    ["1184", 1_184n, 1n],
    ["0,0001", 1n, 10_000n],
    ["1.234.567,123456", 1_234_567_123_456n, 1_000_000n],
  ])(
    "el valor se carga desde el texto decimal %j, exacto",
    (texto, numerador, denominador) => {
      expect(parsearValorTipoDeCambio(texto)).toEqual({
        ok: true,
        valor: { numerador, denominador },
      });
    },
  );

  it.each([
    "0",
    "0,00",
    "-1184,25",
    "",
    "   ",
    "1,184.25",
    "24.31",
    "1184,",
    "1 184",
    "abc",
    "1e3",
  ])("rechaza el valor de TC %j (texto inválido, cero o negativo)", (texto) => {
    expect(parsearValorTipoDeCambio(texto)).toEqual({
      ok: false,
      error: { codigo: CODIGO_TIPO_DE_CAMBIO_INVALIDO, campo: "valor" },
    });
  });

  it("un TC cargado desde texto convierte igual que la fracción", () => {
    const valor = parsearValorTipoDeCambio("1.184,25");
    expect(valor.ok).toBe(true);
    if (!valor.ok) {
      return;
    }
    const resultado = crearTipoDeCambio({
      ...datosTipoDeCambio("USD", "ARS", 1n, 1n),
      valor: valor.valor,
    });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(
        convertir(crearImporte(2_431_500n, "USD"), resultado.valor),
      ).toEqual({ centavos: 2_879_503_875n, moneda: "ARS" });
    }
  });

  it("rechaza un TC de una moneda a sí misma (en tipos y en ejecución)", () => {
    const mismaMoneda = {
      ...datosTipoDeCambio("ARS", "USD", 1n, 1n),
      a: "ARS" as const,
    };

    // @ts-expect-error de y a no pueden ser la misma moneda.
    const resultado = crearTipoDeCambio(mismaMoneda);

    expect(resultado).toEqual({
      ok: false,
      error: { codigo: CODIGO_TIPO_DE_CAMBIO_INVALIDO, campo: "a" },
    });
  });

  /**
   * TC realistas (R8): de 1 a 5000 con hasta cuatro decimales, como se cargan
   * a mano. El valor es `numerador / 10000`.
   */
  const DIEZ_MIL = 10_000n;
  const numeradorRealista = fc.bigInt({
    min: DIEZ_MIL,
    max: 5_000n * DIEZ_MIL,
  });

  it("propiedad: convertir da el entero más cercano a x·n/d, calculado exacto en bigint, y en la mitad se aleja del cero", () => {
    // Referencia exacta, sin redondeo intermedio: r es el más cercano a
    // x·n/d si |2·(r·d − x·n)| ≤ d; en el empate (= d), r se aleja del cero.
    // Montos de hasta 10^15 centavos: con `number` en el medio, el producto
    // pasa 2^53 y esta propiedad se pone en rojo.
    propiedad(
      centavosConBordes,
      fc.bigInt({ min: 1n, max: 10n ** 9n }),
      fc.bigInt({ min: 1n, max: 10n ** 6n }),
      (centavos, numerador, denominador) => {
        const tc = tipoDeCambio("USD", "ARS", numerador, denominador);
        const r = convertir(crearImporte(centavos, "USD"), tc).centavos;
        const desvio = 2n * (r * denominador - centavos * numerador);

        expect(absoluto(desvio) <= denominador).toBe(true);
        if (absoluto(desvio) === denominador) {
          expect(desvio > 0n).toBe(centavos > 0n);
        }
      },
    );
  });

  it("convertir un monto grande es exacto (no pasa por number)", () => {
    // 98_765_432_198_765_432 × 11_842_537 / 10_000 = ...098_278,0984 exacto:
    // se redondea hacia abajo. Con number daría ...110_000 (sin precisión).
    const tc = tipoDeCambio("USD", "ARS", 11_842_537n, 10_000n);

    expect(
      convertir(crearImporte(98_765_432_198_765_432n, "USD"), tc).centavos,
    ).toBe(116_963_328_513_487_098_278n);
  });

  it("propiedad: USD → ARS → USD con el TC inverso difiere del original en a lo sumo un centavo", () => {
    propiedad(centavosConBordes, numeradorRealista, (centavos, numerador) => {
      const ida = tipoDeCambio("USD", "ARS", numerador, DIEZ_MIL);
      const vuelta = tipoDeCambio("ARS", "USD", DIEZ_MIL, numerador);
      const original = crearImporte(centavos, "USD");

      const redondeado = convertir(convertir(original, ida), vuelta);

      expect(absoluto(redondeado.centavos - centavos) <= 1n).toBe(true);
    });
  });

  it("propiedad: ARS → USD → ARS difiere en a lo sumo ceil(valor/2) + 1 centavos de ARS", () => {
    // El redondeo de la ida es en centavos de USD, y cada uno vale `valor`
    // centavos de ARS a la vuelta: la cota crece con el TC (ADR 0018).
    propiedad(centavosConBordes, numeradorRealista, (centavos, numerador) => {
      const ida = tipoDeCambio("ARS", "USD", DIEZ_MIL, numerador);
      const vuelta = tipoDeCambio("USD", "ARS", numerador, DIEZ_MIL);
      const original = crearImporte(centavos, "ARS");

      const error =
        convertir(convertir(original, ida), vuelta).centavos - centavos;
      const mitadDelValorHaciaArriba =
        (numerador + 2n * DIEZ_MIL - 1n) / (2n * DIEZ_MIL);

      expect(absoluto(error) <= mitadDelValorHaciaArriba + 1n).toBe(true);
    });
  });
});

describe("parsearImporte: texto del usuario (regla del ADR 0018)", () => {
  it.each([
    ["24.315,00", 2_431_500n],
    ["24315", 2_431_500n],
    ["24315,5", 2_431_550n],
    ["24.315", 2_431_500n],
    ["1.500", 150_000n],
    ["1.234.567,89", 123_456_789n],
    ["0,05", 5n],
    ["-0", 0n],
    ["-24.315,00", -2_431_500n],
    ["  24.315,00  ", 2_431_500n],
    ["007", 700n],
  ])("acepta %j → %s centavos", (texto, centavos) => {
    expect(parsearImporte(texto, "USD")).toEqual({
      ok: true,
      valor: { centavos, moneda: "USD" },
    });
  });

  it.each([
    "24,315.00", // formato en inglés: la coma es decimal y el punto, de miles
    "24.31", // un punto de miles con dos dígitos
    "1,500.5",
    "1,234", // tres decimales
    "24315,001", // más de dos decimales: no se redondea lo que escribió el usuario
    "24315,",
    "24.3150",
    ".720",
    ",50", // la parte entera es obligatoria
    "024.315",
    "24 315",
    "USD 24.315,00",
    "+13",
    "--13",
    "-",
    "",
    "   ",
    "1e3",
    "١٢", // dígitos no ASCII
  ])("rechaza %j", (texto) => {
    expect(parsearImporte(texto, "ARS")).toEqual({
      ok: false,
      error: { codigo: CODIGO_TEXTO_INVALIDO, texto },
    });
  });

  it("propiedad de ida y vuelta: lo que muestra la pantalla se vuelve a parsear al mismo importe", () => {
    propiedad(centavosConBordes, monedaArbitraria, (centavos, moneda) => {
      const importe = crearImporte(centavos, moneda);

      expect(parsearImporte(formatearMonto(importe), moneda)).toEqual({
        ok: true,
        valor: importe,
      });
    });
  });

  it("propiedad: también se acepta sin separador de miles y sin decimales en cero", () => {
    propiedad(centavosArbitrarios, (centavos) => {
      const signo = centavos < 0n ? "-" : "";
      const positivo = absoluto(centavos);
      const enteros = (positivo / 100n).toString();
      const decimales = (positivo % 100n).toString().padStart(2, "0");
      const texto =
        decimales === "00"
          ? `${signo}${enteros}`
          : `${signo}${enteros},${decimales}`;

      expect(parsearImporte(texto, "ARS")).toEqual({
        ok: true,
        valor: crearImporte(centavos, "ARS"),
      });
    });
  });

  it("propiedad de rechazo: el formato en inglés con decimales nunca se acepta", () => {
    propiedad(
      fc.bigInt({ min: 1_000n, max: CENTAVOS_MAXIMOS }),
      fc.integer({ min: 0, max: 99 }),
      (enteros, decimales) => {
        const conComas = enteros.toString().replace(/\B(?=(\d{3})+$)/g, ",");
        const texto = `${conComas}.${String(decimales).padStart(2, "0")}`;

        expect(parsearImporte(texto, "USD").ok).toBe(false);
      },
    );
  });
});
