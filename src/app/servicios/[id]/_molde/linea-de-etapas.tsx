/**
 * La línea de etapas del servicio (FRONT_SPEC §5): las seis en línea, las
 * recorridas con tilde y enlace a su panel (en solo lectura), la actual
 * resaltada, las futuras apagadas, y los días en cada una. Una salida
 * (perdido, sin respuesta, cancelado) se agrega al final. Se adapta al ancho de
 * su caja: angosta, solo la actual lleva el nombre a la vista.
 */

import { Check } from "lucide-react";
import type { DetalleDeServicio } from "../../../../casos-uso/servicios/servicios.ts";
import type { EstadoServicio } from "../../../../dominio/servicios/estados.ts";
import { cn } from "../../../_ui/cn.ts";
import { Enlace } from "../../../_ui/enlace-next.ts";
import {
  FONDO_DE_ETAPA,
  NOMBRE_DE_ETAPA,
  TEXTO_DE_ETAPA,
} from "../../../_ui/etapa.tsx";
import { dias, diasEnEtapa } from "../datos-de-panel.ts";
import { rutaDeEtapa } from "../rutas.ts";

const ETAPAS: readonly EstadoServicio[] = [
  "creado",
  "cotizado",
  "adjudicado",
  "en_ejecucion",
  "finalizado",
  "cerrado",
];

type Situacion = "recorrida" | "actual" | "futura";

function Marca({
  etapa,
  situacion,
}: {
  readonly etapa: EstadoServicio;
  readonly situacion: Situacion;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative z-10 grid size-5 shrink-0 place-items-center rounded-full bg-superficie",
        situacion === "recorrida" &&
          cn(FONDO_DE_ETAPA[etapa], "text-superficie"),
        situacion === "actual" &&
          cn("ring-2 ring-current ring-offset-2 ring-offset-superficie"),
        situacion === "actual" && TEXTO_DE_ETAPA[etapa],
        situacion === "futura" &&
          "border-[1.5px] border-dashed border-borde-fuerte",
      )}
    >
      {situacion === "recorrida" ? (
        <Check className="size-3" strokeWidth={3} />
      ) : null}
      {situacion === "actual" ? (
        <span className={cn("size-2 rounded-full", FONDO_DE_ETAPA[etapa])} />
      ) : null}
    </span>
  );
}

export function LineaDeEtapas({
  servicio,
}: {
  readonly servicio: DetalleDeServicio;
}) {
  const { id, etapa, recorridas } = servicio;
  const lista = ETAPAS.includes(etapa) ? ETAPAS : [...ETAPAS, etapa];
  return (
    <nav aria-label="Etapas" className="@container/etapas">
      <ol
        className="m-0 grid list-none p-0"
        style={{
          gridTemplateColumns: `repeat(${lista.length}, minmax(0, 1fr))`,
        }}
      >
        {lista.map((valor, lugar) => {
          const situacion: Situacion =
            valor === etapa
              ? "actual"
              : recorridas.includes(valor)
                ? "recorrida"
                : "futura";
          const nombre = NOMBRE_DE_ETAPA[valor];
          const enLaEtapa =
            situacion === "futura" ? null : dias(diasEnEtapa(servicio, valor));
          const alcanzada = situacion !== "futura";
          const contenido = (
            <>
              <Marca etapa={valor} situacion={situacion} />
              <span
                className={cn(
                  "mt-2 block max-w-full truncate text-xs leading-4",
                  situacion === "actual"
                    ? "font-semibold text-texto"
                    : situacion === "recorrida"
                      ? "text-texto-2"
                      : "text-texto-3",
                  situacion === "actual"
                    ? ""
                    : "sr-only @xl/etapas:not-sr-only @xl/etapas:mt-2 @xl/etapas:block",
                )}
              >
                {nombre}
              </span>
              {enLaEtapa === null ? null : (
                <span
                  className={cn(
                    "cifras block text-[11px] leading-4 text-texto-3",
                    situacion === "actual"
                      ? ""
                      : "sr-only @xl/etapas:not-sr-only @xl/etapas:block",
                  )}
                >
                  <span className="sr-only">, </span>
                  {enLaEtapa}
                </span>
              )}
              {situacion === "recorrida" ? (
                <span className="sr-only">, recorrida</span>
              ) : null}
            </>
          );
          return (
            <li
              key={valor}
              data-etapa={valor}
              data-situacion={situacion}
              aria-current={situacion === "actual" ? "step" : undefined}
              className="relative flex min-w-0 flex-col items-center text-center"
            >
              {lugar === 0 ? null : (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-2.5 right-1/2 h-px w-full -translate-y-1/2",
                    alcanzada ? "bg-borde-fuerte" : "bg-borde",
                  )}
                />
              )}
              {situacion === "futura" ? (
                <span className="flex w-full flex-col items-center px-0.5">
                  {contenido}
                </span>
              ) : (
                <Enlace
                  href={rutaDeEtapa(id, valor)}
                  className="presionable group flex w-full flex-col items-center rounded-control px-0.5 pb-1 no-underline hover:[&>span:nth-child(2)]:text-texto pointer-coarse:min-h-11"
                >
                  {contenido}
                </Enlace>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
