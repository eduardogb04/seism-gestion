import type { EstadoServicio } from "../../../dominio/servicios/estados.ts";

/** Las etapas del recorrido que tienen columna propia en el tablero. */
export const ETAPAS_VIVAS = [
  "creado",
  "cotizado",
  "adjudicado",
  "en_ejecucion",
  "finalizado",
] as const satisfies readonly EstadoServicio[];

export type EtapaViva = (typeof ETAPAS_VIVAS)[number];

/** Plegadas a la derecha del tablero: el final feliz y las salidas. */
export const ETAPAS_PLEGADAS = [
  "cerrado",
  "perdido",
  "sin_respuesta",
  "cancelado",
] as const satisfies readonly EstadoServicio[];

export function esViva(etapa: EstadoServicio): etapa is EtapaViva {
  return (ETAPAS_VIVAS as readonly string[]).includes(etapa);
}
