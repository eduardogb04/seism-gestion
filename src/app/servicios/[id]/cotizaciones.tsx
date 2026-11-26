/**
 * Las cotizaciones de un servicio (F2-05, ADR 0035): la línea de versiones
 * (F6-01), con la más nueva arriba y la vigente marcada, y la carga
 * (`?cotizacion=1`) y la anulación (`?anular=<id>`) como ventanas sobre el
 * panel.
 */

import { Download } from "lucide-react";
import { ACEPTA } from "../../../casos-uso/documentos/documentos.ts";
import type { CotizacionListada } from "../../../casos-uso/servicios/cotizaciones.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { cn } from "../../_ui/cn.ts";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { anularCotizacion, cargarCotizacion } from "../acciones.ts";
import { Importe } from "./_molde/panel-de-etapa.tsx";
import { Persona } from "./_molde/persona.tsx";

export async function VentanaDeCarga({
  servicioId,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly rutaAlCerrar: string;
}) {
  const { campos, escrito } =
    await armado().cotizaciones.formulario(servicioId);
  return (
    <Ventana titulo="Nueva cotización" rutaAlCerrar={rutaAlCerrar}>
      <FormularioAbm
        accion={cargarCotizacion.bind(null, servicioId)}
        campos={campos}
        elegibles={{}}
        inicial={{ escrito, errores: {} }}
        archivo={{ nombre: "archivo", etiqueta: "Documento", accept: ACEPTA }}
        enviar={{ texto: "Cargar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

export function VentanaDeAnulacion({
  servicioId,
  cotizacion,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly cotizacion: CotizacionListada | undefined;
  readonly rutaAlCerrar: string;
}) {
  return (
    <Ventana titulo="Anular cotización" rutaAlCerrar={rutaAlCerrar}>
      {cotizacion === undefined ? (
        <ErrorEnPantalla error={pantallaDeCodigo("DOM-0009")} />
      ) : (
        <>
          <p className="mb-4">
            Confirmá que anulás la cotización v{cotizacion.version}. Su número
            de versión no se vuelve a usar.
          </p>
          <FormularioAbm
            accion={anularCotizacion.bind(null, servicioId, cotizacion.id)}
            campos={[]}
            elegibles={{}}
            inicial={{ escrito: {}, errores: {} }}
            enviar={{ texto: "Confirmar anulación", variante: "peligro" }}
            rutaAlCancelar={rutaAlCerrar}
          />
        </>
      )}
    </Ventana>
  );
}

/**
 * Todas las versiones no anuladas, de la más nueva a la más vieja, con su
 * importe, fecha, autor y motivo, en una línea de tiempo. La vigente es la de
 * versión mayor.
 */
export function LineaDeVersiones({
  cotizaciones,
  ruta,
  puedeEscribir,
}: {
  readonly cotizaciones: readonly CotizacionListada[];
  readonly ruta: string;
  readonly puedeEscribir: boolean;
}) {
  const vigente = Math.max(...cotizaciones.map(({ version }) => version));
  return (
    <ol
      aria-label="Versiones de la cotización"
      className="relative m-0 list-none p-0 before:absolute before:top-3 before:bottom-3 before:left-[11px] before:w-px before:bg-borde"
    >
      {cotizaciones.map((cotizacion) => {
        const esVigente = cotizacion.version === vigente;
        return (
          <li
            key={cotizacion.id}
            data-version={cotizacion.version}
            className="relative flex gap-3 pb-3 last:pb-0"
          >
            <span
              aria-hidden="true"
              className={cn(
                "relative z-10 mt-3 grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[10px] font-semibold",
                esVigente
                  ? "border-acento bg-acento text-sobre-acento"
                  : "border-borde-fuerte bg-superficie text-texto-3",
              )}
            >
              v{cotizacion.version}
            </span>
            <div
              className={cn(
                "min-w-0 flex-1 rounded-tarjeta border px-4 py-3",
                esVigente
                  ? "border-acento/40 bg-acento-suave/40"
                  : "border-borde",
              )}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="m-0 flex items-baseline gap-2 text-base font-semibold tracking-tight">
                  <span className="sr-only">v{cotizacion.version} · </span>
                  <Importe valor={cotizacion.importe} />
                  {esVigente ? (
                    <span
                      data-vigente
                      className="rounded-full bg-acento px-1.5 text-[11px] leading-[18px] font-medium text-sobre-acento"
                    >
                      vigente
                    </span>
                  ) : null}
                </p>
                <span className="cifras ml-auto text-xs text-texto-3">
                  {cotizacion.fecha}
                </span>
              </div>
              <p className="mt-1 mb-0 text-[13px] text-texto-2">
                {cotizacion.motivo === ""
                  ? "Primera cotización"
                  : cotizacion.motivo}
              </p>
              {cotizacion.observaciones === "" ? null : (
                <p className="mt-1 mb-0 text-[13px] whitespace-pre-line text-texto-3">
                  {cotizacion.observaciones}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-texto-3">
                <Persona quien={cotizacion.quien} chica />
                <a
                  href={`/documentos/${cotizacion.documento.id}`}
                  download
                  className="inline-flex min-w-0 items-center gap-1 no-underline hover:underline"
                >
                  <Download aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {cotizacion.documento.nombre}
                  </span>
                  <span className="text-texto-3">
                    ({cotizacion.documento.tamano})
                  </span>
                </a>
                {puedeEscribir ? (
                  <Enlace
                    href={`${ruta}?anular=${cotizacion.id}`}
                    scroll={false}
                    className="ml-auto text-texto-3 no-underline hover:text-peligro hover:underline"
                  >
                    Anular
                  </Enlace>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Las cotizaciones que tuvo, en lectura (para las salidas del recorrido). */
export async function Cotizaciones({
  servicioId,
  ruta,
}: {
  readonly servicioId: string;
  readonly ruta: string;
}) {
  const cotizaciones = await armado().cotizaciones.listar(servicioId);
  return cotizaciones.length === 0 ? (
    <p className="m-0 text-[13px] text-texto-3">
      No tuvo cotizaciones cargadas.
    </p>
  ) : (
    <LineaDeVersiones
      cotizaciones={cotizaciones}
      ruta={ruta}
      puedeEscribir={false}
    />
  );
}
