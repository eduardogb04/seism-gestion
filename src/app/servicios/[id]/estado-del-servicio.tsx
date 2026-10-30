/**
 * El servicio por etapa (F3-06; F6-01, ADR 0048): la línea de etapas del
 * encabezado, el color de cada estado y, para los paneles de «Adjudicado» en
 * adelante y las salidas, las secciones que se dibujan en cada uno.
 */

import { Check } from "lucide-react";
import { ETIQUETAS_DE_ESTADO } from "../../../casos-uso/servicios/formulario.ts";
import type { DetalleDeServicio } from "../../../casos-uso/servicios/servicios.ts";
import type { EstadoServicio } from "../../../dominio/servicios/estados.ts";
import { Enlace } from "../../_ui/enlace-next.ts";
import { rutaDeEtapa } from "./rutas.ts";

const ETAPAS: readonly EstadoServicio[] = [
  "creado",
  "cotizado",
  "adjudicado",
  "en_ejecucion",
  "finalizado",
  "cerrado",
];

/** El color del estado: neutro al empezar, aviso mientras espera algo, acento en obra, éxito al cerrar, peligro en las salidas. */
const COLORES: Record<EstadoServicio, string> = {
  creado: "border-borde-control bg-superficie-alta text-texto",
  cotizado: "border-aviso bg-aviso-suave text-aviso",
  adjudicado: "border-acento bg-superficie-alta text-acento",
  en_ejecucion: "border-acento bg-superficie-alta text-acento",
  finalizado: "border-aviso bg-aviso-suave text-aviso",
  cerrado: "border-exito bg-exito-suave text-exito",
  perdido: "border-peligro bg-peligro-suave text-peligro",
  sin_respuesta: "border-peligro bg-peligro-suave text-peligro",
  cancelado: "border-peligro bg-peligro-suave text-peligro",
};

export function ChipDeEstado({
  servicio: { etapa, estado },
}: {
  readonly servicio: DetalleDeServicio;
}) {
  return (
    <span
      data-estado-del-servicio
      data-color={etapa}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold whitespace-nowrap ${COLORES[etapa]}`}
    >
      {estado}
    </span>
  );
}

/** Las recorridas con tilde y enlace a su panel (en solo lectura), la actual resaltada, las futuras apagadas. */
export function LineaDeEtapas({
  servicio: { id, etapa, recorridas },
}: {
  readonly servicio: DetalleDeServicio;
}) {
  const lista = ETAPAS.includes(etapa) ? ETAPAS : [...ETAPAS, etapa];
  return (
    <nav aria-label="Etapas" className="mt-5">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(6rem,1fr))]">
        {lista.map((valor) => {
          const situacion =
            valor === etapa
              ? "actual"
              : recorridas.includes(valor)
                ? "recorrida"
                : "futura";
          const etiqueta = ETIQUETAS_DE_ESTADO[valor];
          return (
            <li
              key={valor}
              data-etapa={valor}
              data-situacion={situacion}
              aria-current={situacion === "actual" ? "step" : undefined}
              className={`border-t-4 pt-2 text-sm ${
                situacion === "actual"
                  ? "border-acento font-semibold text-acento"
                  : situacion === "recorrida"
                    ? "border-exito"
                    : "border-borde text-texto-suave"
              }`}
            >
              {situacion === "futura" ? (
                etiqueta
              ) : (
                <Enlace
                  href={rutaDeEtapa(id, valor)}
                  className="inline-flex items-center gap-1 no-underline hover:underline pointer-coarse:min-h-11"
                >
                  {situacion === "recorrida" ? (
                    <Check aria-hidden="true" className="size-4 text-exito" />
                  ) : null}
                  {etiqueta}
                </Enlace>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Las etapas donde no se cargan sucesos ni se edita el servicio: se mira (en las salidas, solo se cobra lo facturado). */
export function esSoloLectura(etapa: EstadoServicio): boolean {
  return (
    etapa === "cerrado" ||
    etapa === "perdido" ||
    etapa === "sin_respuesta" ||
    etapa === "cancelado"
  );
}
