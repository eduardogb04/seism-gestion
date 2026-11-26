/**
 * Qué se puede hacer en cada estado del servicio (F3-06; F6-01, ADR 0048). La
 * línea de etapas y el chip del encabezado están en `_molde/`.
 */

import type { EstadoServicio } from "../../../dominio/servicios/estados.ts";

/** Las etapas donde no se cargan sucesos ni se edita el servicio: se mira (en las salidas, solo se cobra lo facturado). */
export function esSoloLectura(etapa: EstadoServicio): boolean {
  return (
    etapa === "cerrado" ||
    etapa === "perdido" ||
    etapa === "sin_respuesta" ||
    etapa === "cancelado"
  );
}
