/**
 * Importe con moneda y tipo de cambio (F0-20; DISENO sección 2, decisión 1;
 * P5). *"Cada importe lleva monto + moneda. Cuando hay conversión, un campo de
 * tipo de cambio cargado a mano, con fecha y fuente."*
 *
 * - El monto son **centavos enteros** (`bigint`): ninguna operación pasa por
 *   `number` ni por coma flotante, así que no se pierde ni se inventa un
 *   centavo.
 * - La moneda es un **tipo literal**: `sumar` de `Importe<'ARS'>` con
 *   `Importe<'USD'>` no compila.
 * - El tipo de cambio es una **fracción exacta** de enteros, y `convertir` es
 *   el **único** lugar del dominio que redondea (half-up al centavo).
 * - `parsearImporte` lee el texto que escribe el usuario con una regla
 *   explícita (la de `docs/adr/0018-importes.md`). El formato para pantalla
 *   no vive acá: es presentación (`src/app/formato/importe.ts`).
 *
 * Puro, como todo `src/dominio`: sin `Date`, sin paquetes, sin lanzar por
 * reglas de negocio (devuelve `Resultado`).
 */

import type { Resultado } from "./historial.ts";
import type { Identificador } from "./identificador.ts";
import type { FechaHora } from "./reloj.ts";

/** Las monedas que conoce el sistema. Agregar una es sumarla acá. */
export const MONEDAS = ["ARS", "USD"] as const;

export type Moneda = (typeof MONEDAS)[number];

/** Un monto en centavos enteros, en una moneda conocida en compilación. */
export interface Importe<M extends Moneda> {
  readonly centavos: bigint;
  readonly moneda: M;
}

/**
 * `never` si `M` es una unión de monedas (`Importe<Moneda>`): la aritmética
 * exige saber en compilación **cuál** es la moneda. Sin esto,
 * `sumar(x, y)` con dos `Importe<Moneda>` compilaría aunque en ejecución uno
 * fuera ARS y el otro USD.
 */
type UnaSolaMoneda<M extends Moneda> =
  true extends EsUnion<M> ? never : unknown;

type EsUnion<T, Todo = T> = T extends unknown
  ? [Todo] extends [T]
    ? false
    : true
  : never;

export function crearImporte<M extends Moneda>(
  centavos: bigint,
  moneda: M,
): Importe<M> {
  return Object.freeze({ centavos, moneda });
}

export function sumar<M extends Moneda>(
  a: Importe<M> & UnaSolaMoneda<M>,
  b: Importe<NoInfer<M>>,
): Importe<M>;
export function sumar<M extends Moneda>(
  a: Importe<M>,
  b: Importe<M>,
): Importe<M> {
  return crearImporte(a.centavos + b.centavos, a.moneda);
}

export function restar<M extends Moneda>(
  a: Importe<M> & UnaSolaMoneda<M>,
  b: Importe<NoInfer<M>>,
): Importe<M>;
export function restar<M extends Moneda>(
  a: Importe<M>,
  b: Importe<M>,
): Importe<M> {
  return crearImporte(a.centavos - b.centavos, a.moneda);
}

/** Multiplica por una cantidad entera (unidades, meses): sigue siendo exacto. */
export function multiplicar<M extends Moneda>(
  importe: Importe<M>,
  cantidad: bigint,
): Importe<M> {
  return crearImporte(importe.centavos * cantidad, importe.moneda);
}

export const CODIGO_PARTES_INVALIDAS =
  "DOMINIO.IMPORTE.PARTES_INVALIDAS" as const;

/** Se pidió repartir en una cantidad de partes que no es un entero positivo. */
export interface PartesInvalidas {
  readonly codigo: typeof CODIGO_PARTES_INVALIDAS;
  readonly partes: number;
}

/**
 * Reparte en `partes` importes que suman exactamente el total y que no
 * difieren entre sí en más de un centavo. Los centavos que sobran de la
 * división van, de a uno, a las primeras partes (con el signo del total).
 */
export function repartir<M extends Moneda>(
  importe: Importe<M>,
  partes: number,
): Resultado<readonly Importe<M>[], PartesInvalidas> {
  if (!Number.isSafeInteger(partes) || partes < 1) {
    return {
      ok: false,
      error: Object.freeze({ codigo: CODIGO_PARTES_INVALIDAS, partes }),
    };
  }

  const divisor = BigInt(partes);
  // La división de bigint trunca hacia el cero: el resto lleva el signo del total.
  const base = importe.centavos / divisor;
  const resto = importe.centavos - base * divisor;
  const paso = resto < 0n ? -1n : 1n;
  const conCentavoExtra = Number(resto < 0n ? -resto : resto);

  return {
    ok: true,
    valor: Object.freeze(
      Array.from({ length: partes }, (_, indice) =>
        crearImporte(
          indice < conCentavoExtra ? base + paso : base,
          importe.moneda,
        ),
      ),
    ),
  };
}

declare const marcaTipoDeCambio: unique symbol;

/**
 * Valor exacto de un tipo de cambio: cuántas unidades de `a` vale una de
 * `de`, como fracción de enteros. Un TC cargado a mano (`1.370,50`) es
 * `137050/100`; su inverso (`100/137050`) no tiene expresión decimal finita,
 * y por eso no es un decimal con escala.
 */
export interface ValorTipoDeCambio {
  readonly numerador: bigint;
  readonly denominador: bigint;
}

/** Lo que se carga a mano para registrar un tipo de cambio. */
export interface DatosTipoDeCambio<
  De extends Moneda,
  A extends Exclude<Moneda, De>,
> {
  readonly de: De;
  readonly a: A;
  readonly valor: ValorTipoDeCambio;
  readonly fecha: FechaHora;
  readonly fuente: string;
  /** Quién lo cargó. F0-22 puede cambiarlo por `Actor`. */
  readonly cargadoPor: Identificador<"Usuario">;
}

/**
 * Un tipo de cambio ya validado. Solo lo produce `crearTipoDeCambio`: por la
 * marca de tipo, un objeto con la misma forma armado a mano no lo es, y así
 * `convertir` nunca recibe un denominador en cero.
 */
export type TipoDeCambio<
  De extends Moneda,
  A extends Exclude<Moneda, De>,
> = DatosTipoDeCambio<De, A> & { readonly [marcaTipoDeCambio]: true };

export const CODIGO_TIPO_DE_CAMBIO_INVALIDO =
  "DOMINIO.TIPO_DE_CAMBIO.INVALIDO" as const;

/** Un dato del tipo de cambio no cumple su regla. */
export interface TipoDeCambioInvalido {
  readonly codigo: typeof CODIGO_TIPO_DE_CAMBIO_INVALIDO;
  /** `valor`: no es positivo · `fuente`: vacía · `a`: igual a `de`. */
  readonly campo: "valor" | "fuente" | "a";
}

export function crearTipoDeCambio<
  De extends Moneda,
  A extends Exclude<Moneda, De>,
>(
  datos: DatosTipoDeCambio<De, A>,
): Resultado<TipoDeCambio<De, A>, TipoDeCambioInvalido> {
  const campoInvalido = validarTipoDeCambio(datos);
  if (campoInvalido !== null) {
    return {
      ok: false,
      error: Object.freeze({
        codigo: CODIGO_TIPO_DE_CAMBIO_INVALIDO,
        campo: campoInvalido,
      }),
    };
  }

  const tipoDeCambio = Object.freeze({
    ...datos,
    valor: Object.freeze({ ...datos.valor }),
  });
  return { ok: true, valor: tipoDeCambio as TipoDeCambio<De, A> };
}

function validarTipoDeCambio<De extends Moneda, A extends Exclude<Moneda, De>>(
  datos: DatosTipoDeCambio<De, A>,
): TipoDeCambioInvalido["campo"] | null {
  // Los tipos ya lo impiden; en ejecución puede llegar desde un borde.
  if ((datos.a as Moneda) === datos.de) {
    return "a";
  }
  if (datos.valor.numerador <= 0n || datos.valor.denominador <= 0n) {
    return "valor";
  }
  if (datos.fuente.trim() === "") {
    return "fuente";
  }
  return null;
}

/**
 * Convierte un importe con un tipo de cambio: `centavos × numerador /
 * denominador`, redondeado **half-up al centavo** (P5). Es el único lugar del
 * dominio que redondea. La mitad se aleja del cero en los dos sentidos
 * (`0,5 → 1`, `-0,5 → -1`), así convertir un negativo da el negativo de
 * convertir el positivo.
 */
export function convertir<De extends Moneda, A extends Exclude<Moneda, De>>(
  importe: Importe<NoInfer<De>>,
  tipoDeCambio: TipoDeCambio<De, A>,
): Importe<A> {
  const producto = importe.centavos * tipoDeCambio.valor.numerador;
  const { denominador } = tipoDeCambio.valor;
  const absoluto = producto < 0n ? -producto : producto;

  let cociente = absoluto / denominador;
  if (2n * (absoluto % denominador) >= denominador) {
    cociente += 1n;
  }

  return crearImporte(producto < 0n ? -cociente : cociente, tipoDeCambio.a);
}

export const CODIGO_TEXTO_INVALIDO = "DOMINIO.IMPORTE.TEXTO_INVALIDO" as const;

/** El texto no es un monto según la regla de `parsearImporte`. */
export interface TextoInvalido {
  readonly codigo: typeof CODIGO_TEXTO_INVALIDO;
  readonly texto: string;
}

/**
 * La regla de lectura (ADR 0018): formato argentino, sin ambigüedad.
 * - `-` opcional adelante; nada de `+`, ni código de moneda, ni espacios en el medio.
 * - Parte entera obligatoria: dígitos corridos (`13720`), o agrupados de a
 *   tres con punto (`13.720`), y en ese caso sin cero adelante.
 * - Coma decimal opcional seguida de uno o dos dígitos (`13720,5`).
 * - El punto es **solo** de miles y la coma **solo** decimal: `13,720.00` se
 *   rechaza, no se adivina.
 */
const PATRON_MONTO =
  /^(-)?([0-9]+|[1-9][0-9]{0,2}(?:\.[0-9]{3})+)(?:,([0-9]{1,2}))?$/;

/**
 * Lee el monto que escribió el usuario, en la moneda que ya eligió. No
 * redondea: más de dos decimales es un error, no un monto.
 */
export function parsearImporte<M extends Moneda>(
  texto: string,
  moneda: M,
): Resultado<Importe<M>, TextoInvalido> {
  const coincidencia = PATRON_MONTO.exec(texto.trim());
  const enteros = coincidencia?.[2];
  if (coincidencia === null || enteros === undefined) {
    return {
      ok: false,
      error: Object.freeze({ codigo: CODIGO_TEXTO_INVALIDO, texto }),
    };
  }

  const decimales = (coincidencia[3] ?? "").padEnd(2, "0");
  const positivo =
    BigInt(enteros.replaceAll(".", "")) * 100n + BigInt(decimales);
  const centavos = coincidencia[1] === undefined ? positivo : -positivo;

  return { ok: true, valor: crearImporte(centavos, moneda) };
}
