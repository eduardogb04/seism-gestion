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
 * - El tipo de cambio es una **fracción exacta** de enteros (se carga desde
 *   texto con `parsearValorTipoDeCambio`), y `convertir` es el **único**
 *   lugar del dominio que redondea, con una sola función de redondeo
 *   (`redondearMitadLejosDelCero`, half-up al centavo).
 * - `parsearImporte` lee el texto que escribe el usuario con una regla
 *   explícita (la de `docs/adr/0018-importes.md`). El formato para pantalla
 *   no vive acá: es presentación (`src/app/formato/importe.ts`).
 *
 * Puro, como todo `src/dominio`: sin `Date`, sin paquetes, sin lanzar por
 * reglas de negocio (devuelve `Resultado`).
 */

import { catalogo } from "./errores/catalogo.ts";
import type { Resultado } from "./historial.ts";
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

/** Se pidió repartir en una cantidad de partes que no es un entero positivo. */
export interface PartesInvalidas {
  readonly codigo: typeof catalogo.DOM_0003.codigo;
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
      error: Object.freeze({ codigo: catalogo.DOM_0003.codigo, partes }),
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
 * `de`, como fracción de enteros. Un TC cargado a mano (`1.184,25`) es
 * `118425/100`; su inverso (`100/118425`) no tiene expresión decimal finita,
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
  /** De dónde salió el valor (texto libre, no vacío). */
  readonly fuente: string;
  /** Quién lo cargó (texto no vacío). F0-22 puede cambiarlo por `Actor`. */
  readonly cargadoPor: string;
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

/** Un dato del tipo de cambio no cumple su regla. */
export interface TipoDeCambioInvalido {
  readonly codigo: typeof catalogo.DOM_0004.codigo;
  /**
   * `valor`: no es positivo o su texto no es un decimal válido · `fuente` y
   * `cargadoPor`: vacíos · `a`: igual a `de`.
   */
  readonly campo: "valor" | "fuente" | "cargadoPor" | "a";
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
        codigo: catalogo.DOM_0004.codigo,
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
  if (datos.cargadoPor.trim() === "") {
    return "cargadoPor";
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
  const { numerador, denominador } = tipoDeCambio.valor;
  return crearImporte(
    redondearMitadLejosDelCero(importe.centavos * numerador, denominador),
    tipoDeCambio.a,
  );
}

/**
 * La **única** función de redondeo del dominio (P5, ADR 0018): `dividendo /
 * divisor` (divisor positivo) al entero más cercano; en la mitad exacta se
 * aleja del cero (`1,5 → 2`, `-1,5 → -2`). Todo en `bigint`.
 */
function redondearMitadLejosDelCero(
  dividendo: bigint,
  divisor: bigint,
): bigint {
  const absoluto = dividendo < 0n ? -dividendo : dividendo;
  let cociente = absoluto / divisor;
  if (2n * (absoluto % divisor) >= divisor) {
    cociente += 1n;
  }
  return dividendo < 0n ? -cociente : cociente;
}

/** El texto no es un monto según la regla de `parsearImporte`. */
export interface TextoInvalido {
  readonly codigo: typeof catalogo.DOM_0005.codigo;
  readonly texto: string;
}

/**
 * Parte entera de un número escrito en formato argentino: dígitos corridos
 * (`24315`), o agrupados de a tres exactos con punto de miles (`24.315`), y
 * en ese caso sin cero adelante.
 */
const PARTE_ENTERA = String.raw`([0-9]+|[1-9][0-9]{0,2}(?:\.[0-9]{3})+)`;

const PATRON_MONTO = new RegExp(`^(-)?${PARTE_ENTERA}(?:,([0-9]{1,2}))?$`);

/**
 * Lee el monto que escribió el usuario, en la moneda que ya eligió.
 *
 * **Regla** (ADR 0018), formato argentino y sin adivinar:
 * - Separador decimal: **coma**. Separador de miles: **punto**, opcional, y
 *   si está, en grupos de tres exactos (`24.315`; `24.31` se rechaza).
 * - Hasta **dos** decimales (`24315,5` es 24.315,50). Más de dos es un error:
 *   no se redondea lo que escribió el usuario (`1,234` se rechaza).
 * - Signo `-` opcional adelante; nada de `+`.
 * - Parte entera obligatoria (`,50` se rechaza). Sin punto de miles se
 *   aceptan ceros a la izquierda (`007` es 7,00); con punto de miles, no
 *   (`024.315` se rechaza).
 * - Los espacios de las puntas se ignoran; en el medio se rechazan
 *   (`24 315`), igual que letras, códigos de moneda y notación científica.
 * - El formato en inglés (`24,315.00`) se **rechaza**, no se adivina.
 *
 * Se aceptan `24.315,00`, `24315`, `24315,5` y `-24.315,00`. Lo que escribe
 * `formatearMonto` (`src/app/formato/importe.ts`) se vuelve a leer igual
 * (propiedad de ida y vuelta en `tests/dominio/importe.test.ts`).
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
      error: Object.freeze({ codigo: catalogo.DOM_0005.codigo, texto }),
    };
  }

  const decimales = (coincidencia[3] ?? "").padEnd(2, "0");
  const positivo =
    BigInt(enteros.replaceAll(".", "")) * 100n + BigInt(decimales);
  const centavos = coincidencia[1] === undefined ? positivo : -positivo;

  return { ok: true, valor: crearImporte(centavos, moneda) };
}

const PATRON_VALOR_TIPO_DE_CAMBIO = new RegExp(
  `^${PARTE_ENTERA}(?:,([0-9]+))?$`,
);

/**
 * Lee el valor de un tipo de cambio cargado a mano (`1.184,25`) como fracción
 * exacta: `118425/100`. Misma regla que `parsearImporte` (coma decimal,
 * punto de miles opcional en grupos de tres, espacios de las puntas
 * ignorados), sin signo y con cualquier cantidad de decimales, porque un TC
 * no es un monto. Cero, negativo o texto inválido → `TipoDeCambioInvalido`
 * en `valor`.
 */
export function parsearValorTipoDeCambio(
  texto: string,
): Resultado<ValorTipoDeCambio, TipoDeCambioInvalido> {
  const coincidencia = PATRON_VALOR_TIPO_DE_CAMBIO.exec(texto.trim());
  const enteros = coincidencia?.[1];
  if (coincidencia === null || enteros === undefined) {
    return valorInvalido();
  }

  const decimales = coincidencia[2] ?? "";
  const numerador = BigInt(`${enteros.replaceAll(".", "")}${decimales}`);
  if (numerador === 0n) {
    return valorInvalido();
  }
  return {
    ok: true,
    valor: Object.freeze({
      numerador,
      denominador: 10n ** BigInt(decimales.length),
    }),
  };
}

function valorInvalido(): Resultado<ValorTipoDeCambio, TipoDeCambioInvalido> {
  return {
    ok: false,
    error: Object.freeze({
      codigo: catalogo.DOM_0004.codigo,
      campo: "valor",
    }),
  };
}
