/**
 * El panel de las salidas del recorrido (F6-04): «Perdido», «Sin respuesta» y
 * «Cancelado». Por qué, cuándo y quién lo cambió, la última cotización y, solo
 * en «Sin respuesta», volver a cotizar. Si el servicio ya tenía facturas, se
 * puede cobrar lo que queda.
 */

import { Ban, CalendarClock, Hourglass, Undo2 } from "lucide-react";
import { ETIQUETAS_DE_ESTADO } from "../../../casos-uso/servicios/formulario.ts";
import type { EstadoServicio } from "../../../dominio/servicios/estados.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import {
  BarraDeAcciones,
  CabeceraDePanel,
  GrillaDeMetricas,
} from "../../_ui/panel.tsx";
import { Cotizaciones } from "./cotizaciones.tsx";
import {
  cotizacionVigente,
  type DatosDePanel,
  dias,
  diasEnEtapa,
  transicionesDelPanel,
} from "./datos-de-panel.ts";
import { Facturas } from "./facturas.tsx";

export async function PanelSalida({
  servicio,
  etapa,
  ruta,
  puedeActuar,
  soloLectura,
  parametros,
}: DatosDePanel & { readonly etapa: EstadoServicio }) {
  const cotizaciones = await armado().cotizaciones.listar(servicio.id);
  const vigente = cotizacionVigente(cotizaciones);
  const etiqueta = ETIQUETAS_DE_ESTADO[etapa];
  const cambio = servicio.historial.find(({ a }) => a === etiqueta);
  const conFacturas = (await armado().facturas.listar(servicio.id)).length > 0;
  const { principal } = transicionesDelPanel(servicio, ruta, "cotizado");
  return (
    <article className="rounded border border-borde bg-superficie p-5 shadow-sm dark:shadow-none">
      <CabeceraDePanel
        Icono={Ban}
        titulo={etiqueta}
        contexto={
          soloLectura
            ? `Estuvo ${dias(diasEnEtapa(servicio, etapa))} en «${etiqueta}».`
            : `Pasó a «${etiqueta}» el ${cambio?.cuando ?? ""}. Ya no se carga nada: se mira.`
        }
      />
      <GrillaDeMetricas
        metricas={[
          {
            titulo: "Última cotización",
            Icono: Hourglass,
            valor: vigente === null ? "Sin cotización" : vigente.importe,
            ...(vigente === null
              ? {}
              : { detalle: `versión ${vigente.version} · ${vigente.fecha}` }),
          },
          {
            titulo: "Días en cotización",
            Icono: CalendarClock,
            valor: diasEnEtapa(servicio, "cotizado"),
          },
        ]}
      />
      <dl
        data-cierre
        className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5"
      >
        <dt className="text-texto-suave">Motivo</dt>
        <dd className="whitespace-pre-line">{cambio?.nota}</dd>
        <dt className="text-texto-suave">Fecha</dt>
        <dd>{cambio?.cuando}</dd>
        <dt className="text-texto-suave">Quién</dt>
        <dd>{cambio?.quien}</dd>
      </dl>
      <Cotizaciones servicioId={servicio.id} ruta={ruta} />
      {conFacturas ? (
        <Facturas
          servicioId={servicio.id}
          ruta={ruta}
          puedeFacturar={false}
          puedeCobrar={puedeActuar}
          parametros={parametros}
        />
      ) : null}
      {puedeActuar && etapa === "sin_respuesta" && principal !== null ? (
        <BarraDeAcciones
          principal={{ ...principal, Icono: Undo2 }}
          secundarias={[]}
          salidas={[]}
        />
      ) : null}
    </article>
  );
}
