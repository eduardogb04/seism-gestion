/**
 * El panel de las salidas del recorrido (F6-04, SYSTEM_SPEC §5.3): «Perdido»,
 * «Sin respuesta» y «Cancelado». Por qué, cuándo y quién lo cambió, la última
 * cotización y, solo en «Sin respuesta», «El cliente volvió». Si el servicio ya
 * tenía facturas, se puede cobrar lo que queda.
 */

import {
  Ban,
  CalendarClock,
  CircleSlash,
  Hourglass,
  Receipt,
} from "lucide-react";
import { ETIQUETAS_DE_ESTADO } from "../../../casos-uso/servicios/formulario.ts";
import type { EstadoServicio } from "../../../dominio/servicios/estados.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { accionPrincipalDe } from "./_molde/accion-principal.ts";
import { PanelDeEtapa, Seccion } from "./_molde/panel-de-etapa.tsx";
import { Persona } from "./_molde/persona.tsx";
import { Cotizaciones } from "./cotizaciones.tsx";
import {
  cotizacionVigente,
  type DatosDePanel,
  dias,
  diasEnEtapa,
} from "./datos-de-panel.ts";
import { Facturas } from "./facturas.tsx";

const ICONOS = {
  perdido: CircleSlash,
  sin_respuesta: Hourglass,
  cancelado: Ban,
} as const;

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
  const principal = accionPrincipalDe(servicio, ruta);
  const Icono =
    etapa === "perdido" || etapa === "sin_respuesta" || etapa === "cancelado"
      ? ICONOS[etapa]
      : Ban;
  return (
    <PanelDeEtapa
      etapa={etapa}
      Icono={Icono}
      titulo={etiqueta}
      bajada={
        soloLectura
          ? `Estuvo ${dias(diasEnEtapa(servicio, etapa))} en «${etiqueta}».`
          : etapa === "sin_respuesta"
            ? `Pasó a «${etiqueta}» el ${cambio?.cuando ?? ""}. Si el cliente vuelve, retomalo y queda otra vez en «Cotizado».`
            : `Pasó a «${etiqueta}» el ${cambio?.cuando ?? ""}. Queda en solo lectura.`
      }
      metricas={[
        {
          titulo: "Última cotización",
          Icono: Receipt,
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
      principal={
        puedeActuar && etapa === "sin_respuesta" && !soloLectura
          ? principal
          : null
      }
    >
      <Seccion clave="salida.motivo" titulo="Motivo">
        <figure className="m-0 rounded-tarjeta border border-borde bg-superficie-2/60 px-4 py-3">
          <blockquote
            className={`m-0 text-sm whitespace-pre-line ${
              cambio?.nota ? "text-texto" : "text-texto-3"
            }`}
          >
            {cambio?.nota || "No se dejó un motivo."}
          </blockquote>
          <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-3">
            {cambio === undefined ? null : (
              <>
                <Persona quien={cambio.quien} chica />
                <span className="cifras">{cambio.cuando}</span>
              </>
            )}
          </figcaption>
        </figure>
        {/* Los mismos datos, como lista, para quien los lee de corrido. */}
        <dl data-cierre className="sr-only">
          <dt>Motivo</dt>
          <dd>{cambio?.nota}</dd>
          <dt>Fecha</dt>
          <dd>{cambio?.cuando}</dd>
          <dt>Quién</dt>
          <dd>{cambio?.quien}</dd>
        </dl>
      </Seccion>
      <Seccion
        clave="salida.cotizaciones"
        titulo="Cotizaciones"
        resumen={
          cotizaciones.length === 1
            ? "1 versión"
            : `${cotizaciones.length} versiones`
        }
      >
        <Cotizaciones servicioId={servicio.id} ruta={ruta} />
      </Seccion>
      {conFacturas ? (
        <Seccion
          clave="salida.facturas"
          titulo="Facturas"
          parametros={parametros}
          abreCon={["cobrar", "anularCobro"]}
        >
          <Facturas
            enSeccion
            servicioId={servicio.id}
            ruta={ruta}
            puedeFacturar={false}
            puedeCobrar={puedeActuar}
            parametros={parametros}
            sinFilasNoSeDibuja={false}
          />
        </Seccion>
      ) : null}
    </PanelDeEtapa>
  );
}
