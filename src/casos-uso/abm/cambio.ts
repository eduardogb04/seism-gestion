/**
 * El tipo de cambio de un documento en dólares (F3-04): cómo se lee de lo
 * escrito, cómo vuelve al formulario y cómo se muestra. Es el mismo valor y la
 * misma validación que usan pagos y cobros (`parsearValorTipoDeCambio`, fuente
 * no vacía); solo se guarda, no convierte nada.
 */

import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import {
  type CambioDeDocumento,
  formatearValorTipoDeCambio,
  MONEDA_CON_CAMBIO,
  MONEDAS,
  type Moneda,
  parsearValorTipoDeCambio,
} from "../../dominio/compartido/importe.ts";

export const MENSAJE_CAMBIO_ILEGIBLE =
  "Escribí el tipo de cambio con coma para los decimales (por ejemplo 1.184,25).";

export const MENSAJE_FUENTE_DEL_CAMBIO =
  "Escribí de dónde sale el tipo de cambio.";

const MENSAJE_CAMBIO_FALTA = `${catalogo.DOM_0013.codigo} · Cargá el tipo de cambio (pesos por dólar): el importe es en dólares.`;

const MENSAJE_CAMBIO_SOBRA = `${catalogo.DOM_0013.codigo} · Dejá el tipo de cambio vacío: el importe es en pesos.`;

/** Lo que se ve en lugar del valor cuando un documento en dólares no lo tiene. */
export const SIN_CAMBIO = "sin tipo de cambio";

/** El nombre del control de la fuente de un campo `tipoDeCambio`. */
export function nombreDeFuente(nombre: string): string {
  return `${nombre}Fuente`;
}

/**
 * El tipo de cambio escrito en `nombre` y su fuente, según la moneda del
 * importe: obligatorio en dólares, rechazado en pesos. Sin moneda legible no se
 * juzga (el importe ya marca su error).
 */
export function leerCambio(
  nombre: string,
  monedaEscrita: string | undefined,
  escrito: Readonly<Record<string, string>>,
): { readonly valor: CambioDeDocumento | null } | { readonly error: string } {
  const moneda = MONEDAS.find((codigo) => codigo === monedaEscrita);
  const valorEscrito = (escrito[nombre] ?? "").trim();
  const fuente = (escrito[nombreDeFuente(nombre)] ?? "").trim();
  if (moneda !== MONEDA_CON_CAMBIO) {
    return moneda !== undefined && (valorEscrito !== "" || fuente !== "")
      ? { error: MENSAJE_CAMBIO_SOBRA }
      : { valor: null };
  }
  if (valorEscrito === "") {
    return { error: MENSAJE_CAMBIO_FALTA };
  }
  const leido = parsearValorTipoDeCambio(valorEscrito);
  if (!leido.ok) {
    return { error: MENSAJE_CAMBIO_ILEGIBLE };
  }
  return fuente === ""
    ? { error: MENSAJE_FUENTE_DEL_CAMBIO }
    : { valor: { valor: leido.valor, fuente } };
}

/** Dos tipos de cambio son el mismo si valen lo mismo (no importan los ceros de más) y salen de la misma fuente. */
export function mismoCambio(
  a: CambioDeDocumento | null,
  b: CambioDeDocumento | null,
): boolean {
  return a === null || b === null
    ? a === b
    : a.fuente === b.fuente &&
        a.valor.numerador * b.valor.denominador ===
          b.valor.numerador * a.valor.denominador;
}

/** El tipo de cambio guardado como se escribe en el formulario. */
export function escritoDeCambio(
  nombre: string,
  cambio: CambioDeDocumento | null,
): Readonly<Record<string, string>> {
  return cambio === null
    ? {}
    : {
        [nombre]: formatearValorTipoDeCambio(cambio.valor),
        [nombreDeFuente(nombre)]: cambio.fuente,
      };
}

/**
 * Lo que se muestra del tipo de cambio de un documento: su valor y su fuente,
 * el aviso si es en dólares y no lo tiene, y nada (`null`) si es en pesos.
 */
export function cambioVisible(
  cambio: CambioDeDocumento | null,
  moneda: Moneda,
): { readonly texto: string; readonly falta: boolean } | null {
  if (cambio !== null) {
    return {
      texto: `${formatearValorTipoDeCambio(cambio.valor)} · ${cambio.fuente}`,
      falta: false,
    };
  }
  return moneda === MONEDA_CON_CAMBIO
    ? { texto: SIN_CAMBIO, falta: true }
    : null;
}
