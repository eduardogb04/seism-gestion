/** Lo que comparten las páginas de etapa y sus paneles (F6-01). */

import type { ComponentProps } from "react";
import type { LineaDeAvance } from "../../../casos-uso/servicios/cobros.ts";
import type { CotizacionListada } from "../../../casos-uso/servicios/cotizaciones.ts";
import { ETIQUETAS_DE_ESTADO } from "../../../casos-uso/servicios/formulario.ts";
import type { DetalleDeServicio } from "../../../casos-uso/servicios/servicios.ts";
import type { Accion } from "../../_ui/panel.tsx";
import type { TarjetaKpi } from "../../_ui/tarjeta-kpi.tsx";

export type Parametros = Readonly<
  Record<string, string | string[] | undefined>
>;

/** Lo que recibe el panel de una etapa. */
export type DatosDePanel = {
  readonly servicio: DetalleDeServicio;
  /** La ruta de este panel: ahí se abren sus ventanas. */
  readonly ruta: string;
  /** Si se carga o se cambia algo: no en una etapa recorrida, ni en «Cerrado» o una salida. */
  readonly puedeEscribir: boolean;
  /** Si una persona con rol que escribe mira la etapa actual: puede hacer lo que esa etapa deja, aunque sea solo cobrar o volver a cotizar. */
  readonly puedeActuar: boolean;
  /** Una etapa recorrida que se mira, no la actual. */
  readonly soloLectura: boolean;
  readonly parametros: Parametros;
};

/** Los días civiles que el servicio estuvo (o lleva) en `etapa`, del historial (F3-01). */
export function diasEnEtapa(
  { historial }: DetalleDeServicio,
  etapa: keyof typeof ETIQUETAS_DE_ESTADO,
): number {
  return historial
    .filter(({ a }) => a === ETIQUETAS_DE_ESTADO[etapa])
    .reduce((total, { dias }) => total + dias, 0);
}

export function dias(cantidad: number): string {
  return cantidad === 1 ? "1 día" : `${cantidad} días`;
}

/** La vigente es la cotización de versión mayor. */
export function cotizacionVigente(
  cotizaciones: readonly CotizacionListada[],
): CotizacionListada | null {
  return cotizaciones.reduce<CotizacionListada | null>(
    (mayor, cotizacion) =>
      mayor === null || cotizacion.version > mayor.version ? cotizacion : mayor,
    null,
  );
}

/**
 * Los cambios de etapa que ofrece el servicio, para la barra de acciones: el
 * `principal` (si lo hay) sale aparte y el resto va a las salidas.
 */
export function transicionesDelPanel(
  { transiciones }: DetalleDeServicio,
  ruta: string,
  principal?: string,
): { readonly principal: Accion | null; readonly salidas: readonly Accion[] } {
  const accion = ({ valor, etiqueta }: (typeof transiciones)[number]) => ({
    texto: etiqueta,
    href: `${ruta}?pasar=${valor}`,
  });
  const elegida = transiciones.find(({ valor }) => valor === principal);
  return {
    principal: elegida === undefined ? null : accion(elegida),
    salidas: transiciones.filter((otra) => otra !== elegida).map(accion),
  };
}

/** Lo facturado (con IVA) y lo cobrado, por moneda y sin convertir: la moneda en el título, para que las tarjetas no se repitan. */
export function metricasDeCobro(
  lineas: readonly LineaDeAvance[],
): ComponentProps<typeof TarjetaKpi>[] {
  return lineas.flatMap(({ moneda, facturado, cobrado }) => [
    { titulo: `Facturado (con IVA) · ${moneda}`, valor: facturado },
    { titulo: `Cobrado · ${moneda}`, valor: cobrado },
  ]);
}
