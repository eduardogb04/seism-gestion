/**
 * Cómo pasa un egreso entre su fila y el dominio (F2-03, ADR 0032): las fechas
 * son `Date` en la base y `aaaa-mm-dd` en los datos, y el importe son dos
 * columnas (`importe_centavos` y `importe_moneda`). Las traducciones de día e
 * importe también las usan los pagos (F2-09), y las del tipo de cambio de un
 * documento (tres columnas), las órdenes de compra y las facturas (F3-04).
 */

import { catalogo } from "../../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../../dominio/compartido/errores/error-sistema.ts";
import {
  type CambioDeDocumento,
  crearImporte,
  type Importe,
  MONEDAS,
  type Moneda,
} from "../../../dominio/compartido/importe.ts";
import type { DatosAbm } from "../../../puertos/repositorios/abm.ts";
import type { Egreso as FilaEgreso } from "../generado/client.ts";
import { type Conversion, enColumna } from "./repositorio.ts";

/** El día de un `Date` de una columna `date`: Prisma lo trae a medianoche UTC. */
export function aDia(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export function deDia(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

/** El importe de dos columnas (centavos y moneda): una moneda que el sistema no conoce es un error de la base. */
export function importeDeColumnas(
  centavos: bigint,
  monedaGuardada: string,
): Importe<Moneda> {
  const moneda = MONEDAS.find((codigo) => codigo === monedaGuardada);
  if (moneda === undefined) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "la base devolvió un importe con una moneda desconocida",
    });
  }
  return crearImporte(centavos, moneda);
}

/** El tipo de cambio de tres columnas (numerador, denominador y fuente), o `null` si el documento no lo tiene. */
export function cambioDeColumnas(
  numerador: bigint | null,
  denominador: bigint | null,
  fuente: string | null,
): CambioDeDocumento | null {
  return numerador === null || denominador === null || fuente === null
    ? null
    : { valor: { numerador, denominador }, fuente };
}

export function columnasDeCambio(cambio: CambioDeDocumento | null) {
  return {
    cambioNumerador: cambio?.valor.numerador ?? null,
    cambioDenominador: cambio?.valor.denominador ?? null,
    cambioFuente: cambio?.fuente ?? null,
  };
}

export const CONVERSION_EGRESO: Conversion<FilaEgreso, DatosAbm<"Egreso">> = {
  aDatos({
    fecha,
    vencimiento,
    importeCentavos,
    importeMoneda,
    cambioNumerador,
    cambioDenominador,
    cambioFuente,
    ...resto
  }) {
    return {
      ...resto,
      fecha: aDia(fecha),
      vencimiento: vencimiento === null ? null : aDia(vencimiento),
      importe: importeDeColumnas(importeCentavos, importeMoneda),
      cambio: cambioDeColumnas(
        cambioNumerador,
        cambioDenominador,
        cambioFuente,
      ),
    };
  },

  aFila({ fecha, vencimiento, importe, cambio, ...resto }) {
    return {
      ...resto,
      fecha: deDia(fecha),
      vencimiento: vencimiento === null ? null : deDia(vencimiento),
      importeCentavos: importe.centavos,
      importeMoneda: importe.moneda,
      ...columnasDeCambio(cambio),
    };
  },

  texto: (columna) =>
    columna === "fecha" || columna === "vencimiento" ? undefined : columna,

  marcada: (columna) => columna,

  dia: (columna) =>
    columna === "fecha" || columna === "vencimiento" ? columna : undefined,

  ordenPor: (columna, sentido) =>
    columna === "importe"
      ? { importeCentavos: sentido }
      : enColumna(columna, sentido),
};
