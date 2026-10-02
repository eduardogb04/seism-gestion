/**
 * La regla de saldo (F2-09, ADR 0034): un **total** (una deuda, un cobro) y
 * sus **pagos parciales**, todos en la moneda del total. El saldo nunca es
 * negativo: un pago que lo dejaría así se rechaza, y un pago de cero o
 * negativo también. No sabe de egresos ni de facturas: la usan los pagos de
 * egresos y, tal cual, los cobros.
 *
 * Cuando la cuenta de donde sale el pago es de otra moneda, `importeEnCuenta`
 * calcula lo que salió de ella con `convertir` (importe.ts): el redondeo del
 * dominio queda en un solo lugar, y el saldo del total sigue exacto en su
 * moneda.
 *
 * Puro: sin `Date`, sin lanzar por reglas de negocio.
 */

import { catalogo } from "./errores/catalogo.ts";
import type { Resultado } from "./historial.ts";
import {
  convertir,
  crearImporte,
  crearTipoDeCambio,
  type DatosTipoDeCambio,
  type Importe,
  type Moneda,
  restar,
  sumar,
  type TipoDeCambioInvalido,
  type ValorTipoDeCambio,
} from "./importe.ts";
import type { FechaHora } from "./reloj.ts";

/**
 * `sumar` y `restar` exigen conocer la moneda en compilación para que no se
 * mezclen. Acá la moneda viene del dato (la base, el formulario): la igualdad
 * se comprueba en ejecución (`otra-moneda`) antes de operar, y estas dos
 * firmas dicen que ambos lados son de la misma `M`.
 */
const sumarEnMoneda = sumar as <M extends Moneda>(
  a: Importe<M>,
  b: Importe<M>,
) => Importe<M>;
const restarEnMoneda = restar as <M extends Moneda>(
  a: Importe<M>,
  b: Importe<M>,
) => Importe<M>;

/** Un total, lo pagado y lo que falta, en la moneda del total. */
export interface Saldo<M extends Moneda> {
  readonly total: Importe<M>;
  readonly pagado: Importe<M>;
  readonly saldo: Importe<M>;
}

/**
 * Por qué no se acepta un pago: `no-positivo` (cero o negativo),
 * `supera-saldo` o `otra-moneda` (no está en la moneda del total: hay que
 * convertirlo antes).
 */
export interface PagoRechazado {
  readonly codigo: typeof catalogo.DOM_0012.codigo;
  readonly motivo: "no-positivo" | "supera-saldo" | "otra-moneda";
}

function rechazo(motivo: PagoRechazado["motivo"]): PagoRechazado {
  return Object.freeze({ codigo: catalogo.DOM_0012.codigo, motivo });
}

/** Suma un pago al saldo, o dice por qué no. El saldo que recibe no se modifica. */
export function pagar<M extends Moneda>(
  actual: Saldo<M>,
  pago: Importe<M>,
): Resultado<Saldo<M>, PagoRechazado> {
  if (pago.moneda !== actual.total.moneda) {
    return { ok: false, error: rechazo("otra-moneda") };
  }
  if (pago.centavos <= 0n) {
    return { ok: false, error: rechazo("no-positivo") };
  }
  if (pago.centavos > actual.saldo.centavos) {
    return { ok: false, error: rechazo("supera-saldo") };
  }
  return {
    ok: true,
    valor: Object.freeze({
      total: actual.total,
      pagado: sumarEnMoneda(actual.pagado, pago),
      saldo: restarEnMoneda(actual.saldo, pago),
    }),
  };
}

/**
 * El saldo de `total` después de los pagos, en el orden dado. Un pago que no
 * entra (según `pagar`) rechaza el conjunto entero.
 */
export function saldoDe<M extends Moneda>(
  total: Importe<M>,
  pagos: readonly Importe<M>[],
): Resultado<Saldo<M>, PagoRechazado> {
  let actual: Saldo<M> = Object.freeze({
    total,
    pagado: crearImporte(0n, total.moneda),
    saldo: total,
  });
  for (const pago of pagos) {
    const resultado = pagar(actual, pago);
    if (!resultado.ok) {
      return resultado;
    }
    actual = resultado.valor;
  }
  return { ok: true, valor: actual };
}

/** El tipo de cambio de un pago: lo que se cargó a mano ese día. */
export interface CambioCargado {
  readonly valor: ValorTipoDeCambio;
  /** De dónde salió el valor: texto no vacío. */
  readonly fuente: string;
  readonly fecha: FechaHora;
  readonly cargadoPor: string;
}

/**
 * `falta`: la cuenta es de otra moneda y no hay tipo de cambio · `sobra`: es
 * la misma moneda y hay uno.
 */
export interface CambioIncorrecto {
  readonly codigo: typeof catalogo.DOM_0013.codigo;
  readonly motivo: "falta" | "sobra";
}

/**
 * Lo que salió de la cuenta por un pago de `importe`: lo mismo si la cuenta
 * es de la moneda del pago, y si no, el importe convertido con el tipo de
 * cambio cargado (`convertir`, half-up al centavo). El tipo de cambio es
 * obligatorio cuando las monedas difieren y no va cuando coinciden
 * (`DOM-0013`); uno con fuente en blanco o valor inválido vuelve como
 * `DOM-0004`.
 */
export function importeEnCuenta(
  importe: Importe<Moneda>,
  monedaDeLaCuenta: Moneda,
  cambio: CambioCargado | null,
): Resultado<Importe<Moneda>, CambioIncorrecto | TipoDeCambioInvalido> {
  const mismaMoneda = importe.moneda === monedaDeLaCuenta;
  if (mismaMoneda && cambio === null) {
    return { ok: true, valor: importe };
  }
  if (cambio === null || mismaMoneda) {
    return {
      ok: false,
      error: Object.freeze({
        codigo: catalogo.DOM_0013.codigo,
        motivo: mismaMoneda ? "sobra" : "falta",
      }),
    };
  }
  // Que las monedas son distintas se comprobó arriba; el tipo de `crearTipoDeCambio` lo quiere sabido en compilación.
  const datos = {
    ...cambio,
    de: importe.moneda,
    a: monedaDeLaCuenta,
  } as DatosTipoDeCambio<Moneda, never>;
  const tipoDeCambio = crearTipoDeCambio(datos);
  if (!tipoDeCambio.ok) {
    return tipoDeCambio;
  }
  return { ok: true, valor: convertir(importe, tipoDeCambio.valor) };
}
