/**
 * Las cotizaciones de un servicio (F2-05, ADR 0035): la línea de versiones
 * (F6-01), con la más nueva arriba y la vigente marcada, y la carga
 * (`?cotizacion=1`) y la anulación (`?anular=<id>`) como ventanas sobre el
 * panel.
 */

import { ACEPTA } from "../../../casos-uso/documentos/documentos.ts";
import type { CotizacionListada } from "../../../casos-uso/servicios/cotizaciones.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { EnlaceDeDescarga } from "../../_ui/enlace-de-descarga.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { anularCotizacion, cargarCotizacion } from "../acciones.ts";

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
 * importe, fecha, autor y motivo. La vigente es la de versión mayor.
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
    <ol aria-label="Versiones de la cotización">
      {cotizaciones.map((cotizacion) => {
        const esVigente = cotizacion.version === vigente;
        return (
          <li
            key={cotizacion.id}
            data-version={cotizacion.version}
            className="grid grid-cols-[0.75rem_minmax(0,1fr)_auto] gap-3 border-t border-borde py-3 first:border-t-0"
          >
            <span
              aria-hidden="true"
              className={`mt-1.5 size-3 rounded-full border-2 ${esVigente ? "border-acento bg-acento" : "border-borde-control bg-superficie"}`}
            />
            <div>
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                v{cotizacion.version} · {cotizacion.importe}
                {esVigente ? (
                  <span
                    data-vigente
                    className="rounded-full border border-acento px-2 text-xs font-semibold text-acento"
                  >
                    vigente
                  </span>
                ) : null}
              </p>
              <p className="text-sm text-texto-suave">
                {cotizacion.motivo === ""
                  ? "Primera cotización"
                  : cotizacion.motivo}{" "}
                · {cotizacion.quien}
              </p>
              {cotizacion.observaciones === "" ? null : (
                <p className="mt-1 text-sm whitespace-pre-line">
                  {cotizacion.observaciones}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 text-right text-sm">
              <span className="tabular-nums">{cotizacion.fecha}</span>
              <EnlaceDeDescarga {...cotizacion.documento} />
              {puedeEscribir ? (
                <Enlace href={`${ruta}?anular=${cotizacion.id}`} scroll={false}>
                  Anular
                </Enlace>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** La sección de las salidas del recorrido: las cotizaciones que tuvo, en lectura. */
export async function Cotizaciones({
  servicioId,
  ruta,
}: {
  readonly servicioId: string;
  readonly ruta: string;
}) {
  const cotizaciones = await armado().cotizaciones.listar(servicioId);
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Cotizaciones</h2>
      {cotizaciones.length === 0 ? (
        <p>Todavía no hay cotizaciones cargadas.</p>
      ) : (
        <LineaDeVersiones
          cotizaciones={cotizaciones}
          ruta={ruta}
          puedeEscribir={false}
        />
      )}
    </section>
  );
}
