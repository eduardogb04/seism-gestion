/**
 * Un panel por etapa del servicio (F6-01, ADR 0048): qué ruta tiene cada
 * estado, qué etapa muestra una ruta, y el servicio que leen el layout y la
 * página de una misma pedida.
 */

import { cache } from "react";
import type { DetalleDeServicio } from "../../../casos-uso/servicios/servicios.ts";
import { codigoDeError } from "../../../casos-uso/sesion/errores.ts";
import type { EstadoServicio } from "../../../dominio/servicios/estados.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";

/** Perdido, sin respuesta y cancelado comparten panel: las salidas del recorrido. */
const SEGMENTOS = {
  creado: "creado",
  cotizado: "cotizado",
  adjudicado: "adjudicado",
  en_ejecucion: "en-ejecucion",
  finalizado: "finalizado",
  cerrado: "cerrado",
  perdido: "salida",
  sin_respuesta: "salida",
  cancelado: "salida",
} as const satisfies Record<EstadoServicio, string>;

export type Segmento = (typeof SEGMENTOS)[EstadoServicio];

export function rutaDeEtapa(id: string, etapa: EstadoServicio): string {
  return `/servicios/${encodeURIComponent(id)}/${SEGMENTOS[etapa]}`;
}

/**
 * Qué muestra la ruta `segmento`: la etapa actual, editable; una ya recorrida,
 * en solo lectura (la última, si dos comparten ruta); o `null` si el servicio
 * todavía no llegó ahí, y la página redirige a la actual.
 */
export function etapaDeLaRuta(
  { etapa, recorridas }: DetalleDeServicio,
  segmento: Segmento,
): { readonly etapa: EstadoServicio; readonly soloLectura: boolean } | null {
  if (SEGMENTOS[etapa] === segmento) {
    return { etapa, soloLectura: false };
  }
  const recorrida = recorridas.findLast(
    (pasada) => SEGMENTOS[pasada] === segmento,
  );
  return recorrida === undefined
    ? null
    : { etapa: recorrida, soloLectura: true };
}

/** `/servicios/<id>` o el panel de una de sus etapas, con o sin parámetros. */
const RUTA_DE_SERVICIO = /^\/servicios\/([0-9a-f-]{36})(?:\/[a-z-]+)?(\?.*)?$/;

/**
 * A dónde vuelve una acción que escribió en un servicio: al panel de la etapa
 * en la que quedó, con los mismos parámetros. Pasar por la redirección de
 * `/servicios/<id>` (o volver a un panel que ya no es el actual) deja el
 * layout sin volver a dibujar: el estado, la línea de etapas y los sucesos
 * quedarían como antes de escribir. Otra ruta vuelve tal cual.
 */
export async function panelDeLaEtapaActual(ruta: string): Promise<string> {
  const [, id, consulta = ""] = RUTA_DE_SERVICIO.exec(ruta) ?? [];
  if (id === undefined) {
    return ruta;
  }
  const leido = await servicioDe(id);
  return leido.ok
    ? `${rutaDeEtapa(id, leido.servicio.etapa)}${consulta}`
    : ruta;
}

/**
 * El servicio, una sola vez por pedida aunque lo lean el layout y la página.
 * Un error del catálogo (no existe, dado de baja) vuelve como código: lo
 * muestra el layout.
 */
export const servicioDe = cache(
  async (
    id: string,
  ): Promise<
    | { readonly ok: true; readonly servicio: DetalleDeServicio }
    | { readonly ok: false; readonly codigo: string }
  > => {
    try {
      return { ok: true, servicio: await armado().servicios.ver(id) };
    } catch (fallo) {
      const codigo = codigoDeError(fallo);
      if (codigo === null) {
        throw fallo;
      }
      return { ok: false, codigo };
    }
  },
);
