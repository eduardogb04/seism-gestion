/**
 * Convertir lo del tablero a una sola moneda (F3-08, ADR 0042): cada documento
 * con **su** tipo de cambio, redondeado al centavo por `convertir`, y recién
 * después se suma. Sumar primero y convertir con un promedio da otro número.
 *
 * El tipo de cambio de un documento siempre son pesos por dólar; en la otra
 * dirección (pesos a dólares) se usa su inverso.
 */

import {
  convertir,
  crearImporte,
  crearTipoDeCambio,
  type DatosTipoDeCambio,
  type Importe,
  MONEDA_CON_CAMBIO,
  type Moneda,
  multiplicar,
  type ValorTipoDeCambio,
} from "../compartido/importe.ts";
import type { FechaHora } from "../compartido/reloj.ts";
import { sumarEnMoneda } from "../compartido/saldo.ts";

/** Un grupo de `cantidad` documentos con el mismo importe y el mismo tipo de cambio. */
export interface MontoParaConvertir {
  readonly importe: Importe<Moneda>;
  /** Pesos por dólar que le toca al documento; `null`: no tiene. */
  readonly cambio: ValorTipoDeCambio | null;
  readonly cantidad: number;
}

/**
 * `importe` en `destino`, o `null` si está en otra moneda y no hay tipo de
 * cambio (no se lo cuenta como cero: quien llama lo muestra aparte). `hoy` es
 * solo la fecha con que `crearTipoDeCambio` arma el valor que `convertir` pide.
 */
export function convertirDeDocumento(
  importe: Importe<Moneda>,
  destino: Moneda,
  cambio: ValorTipoDeCambio | null,
  hoy: FechaHora,
): Importe<Moneda> | null {
  if (importe.moneda === destino) {
    return importe;
  }
  if (cambio === null) {
    return null;
  }
  const valor =
    importe.moneda === MONEDA_CON_CAMBIO
      ? cambio
      : { numerador: cambio.denominador, denominador: cambio.numerador };
  // Las monedas son distintas (se comprobó arriba); el tipo de `crearTipoDeCambio` lo quiere sabido en compilación.
  const datos = {
    de: importe.moneda,
    a: destino,
    valor,
    fecha: hoy,
    fuente: "tipo de cambio del documento",
    cargadoPor: "tablero",
  } as DatosTipoDeCambio<Moneda, never>;
  const tipoDeCambio = crearTipoDeCambio(datos);
  return tipoDeCambio.ok ? convertir(importe, tipoDeCambio.valor) : null;
}

/** La suma, en `destino`, de lo que se pudo convertir; lo que no, queda afuera. */
export function sumarConvertidos(
  destino: Moneda,
  montos: readonly MontoParaConvertir[],
  hoy: FechaHora,
): Importe<Moneda> {
  return montos.reduce<Importe<Moneda>>(
    (suma, { importe, cambio, cantidad }) => {
      const convertido = convertirDeDocumento(importe, destino, cambio, hoy);
      return convertido === null
        ? suma
        : sumarEnMoneda(suma, multiplicar(convertido, BigInt(cantidad)));
    },
    crearImporte(0n, destino),
  );
}
