/**
 * El ciclo de vida de un servicio (F2-04, ADR 0033), sobre el historial de
 * F0-21: el estado de un servicio es su último evento, no una columna.
 *
 * El parámetro `origen` del historial lleva la **nota** de quien hizo el
 * cambio: hoy todos los cambios de estado se hacen a mano, desde la pantalla.
 */

import type { Actor } from "../compartido/actor.ts";
import {
  definirCiclo,
  type Evento,
  type Historial,
  type Transiciones,
} from "../compartido/historial.ts";
import { diferenciaEnDias, type FechaHora } from "../compartido/reloj.ts";

/** El prefijo del código legible de un servicio: `SRV-2026-014`. */
export const PREFIJO_DE_CODIGO = "SRV";

export const ESTADOS_SERVICIO = [
  "solicitado",
  "cotizado",
  "adjudicado",
  "vigente",
  "cerrado",
  "perdido",
  "sin_respuesta",
  "cancelado",
] as const;

export type EstadoServicio = (typeof ESTADOS_SERVICIO)[number];

export const ESTADO_INICIAL: EstadoServicio = "solicitado";

const TRANSICIONES: Transiciones<EstadoServicio> = {
  solicitado: ["cotizado", "perdido", "sin_respuesta", "cancelado"],
  cotizado: ["adjudicado", "perdido", "sin_respuesta", "cancelado"],
  adjudicado: ["vigente", "perdido", "sin_respuesta", "cancelado"],
  vigente: ["cerrado", "cancelado"],
  cerrado: [],
  perdido: [],
  // El cliente contestó: vuelve a estar cotizado.
  sin_respuesta: ["cotizado"],
  cancelado: [],
};

export type EventoServicio = Evento<
  EstadoServicio,
  FechaHora,
  Actor,
  string | null
>;

export type HistorialServicio = Historial<
  EstadoServicio,
  FechaHora,
  Actor,
  string | null
>;

export const cicloServicio = definirCiclo<
  EstadoServicio,
  FechaHora,
  Actor,
  string | null
>({ transiciones: TRANSICIONES, diferenciaEnDias });

/** A qué estados se puede pasar desde `estado`. */
export function transicionesDesde(
  estado: EstadoServicio,
): readonly EstadoServicio[] {
  return TRANSICIONES[estado];
}

/** Un servicio que ya avanzó no se da de baja: se cancela o se cierra. */
export function admiteBaja(estado: EstadoServicio): boolean {
  return estado === ESTADO_INICIAL;
}
