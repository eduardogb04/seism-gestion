/**
 * La etapa de un servicio: el mismo color en el tablero, los chips, el
 * calendario y los gráficos (FRONT_SPEC §3.1). `ChipDeEtapa` es el punto de
 * color con el nombre; la variante llena va en encabezados.
 */

import type { EstadoServicio } from "../../dominio/servicios/estados.ts";
import { cn } from "./cn.ts";

export const NOMBRE_DE_ETAPA: Readonly<Record<EstadoServicio, string>> = {
  creado: "Creado",
  cotizado: "Cotizado",
  adjudicado: "Adjudicado",
  en_ejecucion: "En ejecución",
  finalizado: "Finalizado",
  cerrado: "Cerrado",
  perdido: "Perdido",
  sin_respuesta: "Sin respuesta",
  cancelado: "Cancelado",
};

/** El fondo con el color de la etapa (puntos, barras, la variante llena). */
export const FONDO_DE_ETAPA: Readonly<Record<EstadoServicio, string>> = {
  creado: "bg-etapa-creado",
  cotizado: "bg-etapa-cotizado",
  adjudicado: "bg-etapa-adjudicado",
  en_ejecucion: "bg-etapa-ejecucion",
  finalizado: "bg-etapa-finalizado",
  cerrado: "bg-etapa-cerrado",
  perdido: "bg-etapa-salida",
  sin_respuesta: "bg-texto-3",
  cancelado: "bg-etapa-salida",
};

/** El texto con el color de la etapa. */
export const TEXTO_DE_ETAPA: Readonly<Record<EstadoServicio, string>> = {
  creado: "text-etapa-creado",
  cotizado: "text-etapa-cotizado",
  adjudicado: "text-etapa-adjudicado",
  en_ejecucion: "text-etapa-ejecucion",
  finalizado: "text-etapa-finalizado",
  cerrado: "text-etapa-cerrado",
  perdido: "text-etapa-salida",
  sin_respuesta: "text-texto-3",
  cancelado: "text-etapa-salida",
};

export function PuntoDeEtapa({
  etapa,
  className,
}: {
  readonly etapa: EstadoServicio;
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        FONDO_DE_ETAPA[etapa],
        className,
      )}
    />
  );
}

export function ChipDeEtapa({
  etapa,
  llena = false,
  className,
}: {
  readonly etapa: EstadoServicio;
  /** Para el encabezado de un servicio: fondo suave del color de la etapa. */
  readonly llena?: boolean;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-[13px] font-medium leading-5",
        llena
          ? "isolate overflow-hidden px-2.5 py-0.5 text-texto"
          : "text-texto-2",
        className,
      )}
    >
      {llena ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 -z-10 opacity-15",
            FONDO_DE_ETAPA[etapa],
          )}
        />
      ) : null}
      <PuntoDeEtapa etapa={etapa} />
      {NOMBRE_DE_ETAPA[etapa]}
    </span>
  );
}
