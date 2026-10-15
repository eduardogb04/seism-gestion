/**
 * Lo que repiten los pagos de egresos (F2-09) y los cobros de facturas (F2-07),
 * que usan la misma regla de saldo y el mismo tipo de cambio (`saldo.ts`): los
 * mensajes que ve la persona, el paso de importe a lo que movió la cuenta y los
 * días de atraso de un vencimiento. Cada uno aporta solo lo suyo: cómo se llama
 * la deuda y de dónde salen el importe y la cuenta.
 */

import type { Actor } from "../../dominio/compartido/actor.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import {
  formatearImporte,
  type Importe,
  MONEDAS,
  type Moneda,
  parsearValorTipoDeCambio,
} from "../../dominio/compartido/importe.ts";
import {
  diferenciaEnDias,
  type FechaHora,
  parsearISO,
} from "../../dominio/compartido/reloj.ts";
import {
  type CambioCargado,
  type CambioIncorrecto,
  importeEnCuenta,
  type PagoRechazado,
  type Saldo,
} from "../../dominio/compartido/saldo.ts";
import type { ErroresPorCampo } from "../abm/abm.ts";
import type { Escrito } from "../abm/definicion.ts";

/** Cómo se nombra la deuda en los mensajes. */
export type TextosDeSaldo = {
  readonly verbo: "pagar" | "cobrar";
  /** `el egreso`, `la factura`. */
  readonly deuda: string;
  /** `del egreso`, `de la factura`. */
  readonly deLaDeuda: string;
};

/** Un día `aaaa-mm-dd` ya validado, como `FechaHora` (a medianoche). */
export function aFechaHora(dia: string): FechaHora {
  const resultado = parsearISO(`${dia}T00:00:00.000`);
  if (!resultado.ok) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "un día que ya se había validado no es una fecha",
    });
  }
  return resultado.fechaHora;
}

export function monedaDe(texto: string): Moneda {
  const moneda = MONEDAS.find((codigo) => codigo === texto);
  if (moneda === undefined) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "la base devolvió una cuenta con una moneda desconocida",
    });
  }
  return moneda;
}

export function mensajeDeSaldo(
  motivo: PagoRechazado["motivo"],
  saldo: Saldo<Moneda>,
  { verbo, deLaDeuda }: TextosDeSaldo,
): string {
  switch (motivo) {
    case "no-positivo":
      return "El importe tiene que ser mayor que cero.";
    case "supera-saldo":
      return `${catalogo.DOM_0012.codigo} · El importe supera lo que falta ${verbo}: quedan ${formatearImporte(saldo.saldo)}.`;
    case "otra-moneda":
      return `El importe no está en la moneda ${deLaDeuda}.`;
  }
}

function mensajeDeCambio(
  motivo: CambioIncorrecto["motivo"],
  moneda: Moneda,
  { deuda }: TextosDeSaldo,
): string {
  return motivo === "falta"
    ? `${catalogo.DOM_0013.codigo} · Cargá el tipo de cambio del día: la cuenta es de otra moneda que ${deuda} (${moneda}).`
    : `${catalogo.DOM_0013.codigo} · Dejá el tipo de cambio vacío: la cuenta es de la misma moneda que ${deuda}.`;
}

/**
 * Lo que movió la cuenta por `importe` (`importeEnCuenta`) y el tipo de cambio
 * cargado, o lo que la persona tiene que corregir. `importe` y `monedaDeLaCuenta`
 * son `null` si ya fallaron antes: entonces no se calcula nada.
 */
export function movimientoEnCuenta({
  escrito,
  actor,
  dia,
  diaValido,
  importe,
  monedaDeLaCuenta,
  textos,
}: {
  readonly escrito: Escrito;
  readonly actor: Actor;
  readonly dia: string;
  readonly diaValido: boolean;
  readonly importe: Importe<Moneda> | null;
  readonly monedaDeLaCuenta: Moneda | null;
  readonly textos: TextosDeSaldo;
}): {
  readonly cambio: CambioCargado | null;
  readonly enCuenta: Importe<Moneda> | null;
  readonly errores: ErroresPorCampo;
} {
  const errores: Record<string, string> = {};
  const valorEscrito = (escrito.tipoDeCambio ?? "").trim();
  const valorLeido =
    valorEscrito === "" ? null : parsearValorTipoDeCambio(valorEscrito);
  if (valorLeido?.ok === false) {
    errores.tipoDeCambio =
      "Escribí el tipo de cambio con coma para los decimales (por ejemplo 1.184,25).";
  }
  const cambio: CambioCargado | null =
    valorLeido?.ok === true && diaValido
      ? {
          valor: valorLeido.valor,
          fuente: escrito.fuenteDelCambio ?? "",
          fecha: aFechaHora(dia),
          cargadoPor:
            actor.tipo === "persona" ? actor.usuarioId : actor.proceso,
        }
      : null;

  let enCuenta: Importe<Moneda> | null = null;
  if (
    importe !== null &&
    monedaDeLaCuenta !== null &&
    errores.tipoDeCambio === undefined
  ) {
    const convertido = importeEnCuenta(importe, monedaDeLaCuenta, cambio);
    if (convertido.ok) {
      enCuenta = convertido.valor;
    } else if (convertido.error.codigo === catalogo.DOM_0013.codigo) {
      errores.tipoDeCambio = mensajeDeCambio(
        convertido.error.motivo,
        importe.moneda,
        textos,
      );
    } else if (convertido.error.campo === "fuente") {
      errores.fuenteDelCambio = "Escribí de dónde sale el tipo de cambio.";
    } else {
      errores.tipoDeCambio = "El tipo de cambio no es válido.";
    }
  }
  return { cambio, enCuenta, errores };
}

function dias(cantidad: number): string {
  return cantidad === 1 ? "1 día" : `${cantidad} días`;
}

/** `10 días` desde el vencimiento, o vacío si todavía no venció. */
export function atrasoDe(hoy: FechaHora, vencimiento: string): string {
  const atrasado = diferenciaEnDias(hoy, aFechaHora(vencimiento));
  return atrasado > 0 ? dias(atrasado) : "";
}
