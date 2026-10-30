/** Lo que comparten las páginas de etapa y sus paneles (F6-01). */

import { ETIQUETAS_DE_ESTADO } from "../../../casos-uso/servicios/formulario.ts";
import type { DetalleDeServicio } from "../../../casos-uso/servicios/servicios.ts";

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
