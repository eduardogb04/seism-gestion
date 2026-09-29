/**
 * Costos de IA en micro-dólares (F0-28, ADR 0026). El `Importe` de F0-20
 * trabaja en centavos: no alcanza para el costo de unos pocos tokens
 * (`0.000150` USD). Los montos de IA son **micro-dólares enteros** (`bigint`,
 * un millonésimo de dólar): se suman sin redondeo y nunca como `number`.
 *
 * En `configuracion` (el tope mensual y el costo estimado por perfil) y en la
 * base (`uso_ia.costo_usd`, `Decimal(14,6)`) viajan como texto decimal con
 * **punto** (`"20.00"`, `"0.015"`): es un parámetro técnico, no un monto que
 * escribe una persona en formato argentino.
 */
import type { Resultado } from "./historial.ts";

/** Un monto en dólares expresado en micro-dólares enteros (1 USD = 1.000.000). */
export type MicroUsd = bigint;

/** Micro-dólares por dólar. */
const POR_DOLAR = 1_000_000n;

/** Decimales que entran en un micro-dólar. */
const DECIMALES = 6;

/** Decimales que se escriben siempre, aunque sean ceros (`20.00`). */
const DECIMALES_MINIMOS = 2;

/** Por qué un texto no es un monto en dólares. */
export type MotivoUsdInvalido =
  | "no-numerico"
  | "negativo"
  | "demasiados-decimales";

export interface UsdInvalido {
  readonly motivo: MotivoUsdInvalido;
  readonly texto: string;
}

const PATRON_USD = /^(-)?([0-9]+)(?:\.([0-9]+))?$/;

/**
 * Lee un monto en dólares escrito con punto decimal (`"20.00"`, `"0.015"`,
 * `"5"`). Regla, sin adivinar:
 * - Dígitos, y opcionalmente un punto seguido de al menos un dígito. Nada de
 *   espacios, comas, signo `+`, notación científica ni moneda.
 * - Hasta **seis** decimales: más es un error, no se redondea.
 * - Un signo `-` adelante se rechaza como negativo (un costo o un tope no lo
 *   son nunca).
 */
export function parsearUsd(texto: string): Resultado<MicroUsd, UsdInvalido> {
  const coincidencia = PATRON_USD.exec(texto);
  const enteros = coincidencia?.[2];
  if (coincidencia === null || enteros === undefined) {
    return invalido("no-numerico", texto);
  }
  if (coincidencia[1] !== undefined) {
    return invalido("negativo", texto);
  }
  const decimales = coincidencia[3] ?? "";
  if (decimales.length > DECIMALES) {
    return invalido("demasiados-decimales", texto);
  }
  return {
    ok: true,
    valor:
      BigInt(enteros) * POR_DOLAR + BigInt(decimales.padEnd(DECIMALES, "0")),
  };
}

/**
 * Escribe micro-dólares como texto decimal con punto: al menos dos
 * decimales y, si hacen falta más, hasta seis sin ceros de cola (`"20.00"`,
 * `"0.015"`, `"0.000001"`). `parsearUsd` lo vuelve a leer exacto.
 */
export function formatearUsd(microUsd: MicroUsd): string {
  const signo = microUsd < 0n ? "-" : "";
  const absoluto = microUsd < 0n ? -microUsd : microUsd;
  const enteros = absoluto / POR_DOLAR;
  const fraccion = (absoluto % POR_DOLAR)
    .toString()
    .padStart(DECIMALES, "0")
    .replace(/0+$/, "")
    .padEnd(DECIMALES_MINIMOS, "0");
  return `${signo}${enteros}.${fraccion}`;
}

function invalido(
  motivo: MotivoUsdInvalido,
  texto: string,
): Resultado<MicroUsd, UsdInvalido> {
  return { ok: false, error: Object.freeze({ motivo, texto }) };
}
