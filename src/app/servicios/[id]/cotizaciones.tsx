/**
 * La sección *Cotizaciones* de la pantalla de un servicio (F2-05, ADR 0035): la
 * tabla, con la más nueva arriba, y la carga (`?cotizacion=1`) y la anulación
 * (`?anular=<id>`) como ventanas sobre esta misma pantalla, como las demás.
 */

import { ACEPTA } from "../../../casos-uso/documentos/documentos.ts";
import type { CotizacionListada } from "../../../casos-uso/servicios/cotizaciones.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { EnlaceDeDescarga } from "../../_ui/enlace-de-descarga.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { anularCotizacion, cargarCotizacion } from "../acciones.ts";

const CABECERAS = [
  "Versión",
  "Fecha",
  "Importe",
  "Motivo de la revisión",
  "Documento",
  "Cargada por",
];

async function VentanaDeCarga({
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

function VentanaDeAnulacion({
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

export async function Cotizaciones({
  servicioId,
  ruta,
  puedeEscribir,
  parametros,
}: {
  readonly servicioId: string;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const cotizaciones = await armado().cotizaciones.listar(servicioId);
  const aAnular = parametros.anular;
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Cotizaciones</h2>
      {puedeEscribir ? (
        <p className="mb-3">
          <Enlace
            href={`${ruta}?cotizacion=1`}
            scroll={false}
            className={clasesDeBoton("primario")}
          >
            Nueva cotización
          </Enlace>
        </p>
      ) : null}
      {cotizaciones.length === 0 ? (
        <p>Todavía no hay cotizaciones cargadas.</p>
      ) : (
        <Tabla
          cabeceras={puedeEscribir ? [...CABECERAS, "Acciones"] : CABECERAS}
        >
          {cotizaciones.map((cotizacion) => (
            <tr key={cotizacion.id}>
              <td>v{cotizacion.version}</td>
              <td>{cotizacion.fecha}</td>
              <td>{cotizacion.importe}</td>
              <td className="whitespace-pre-line">{cotizacion.motivo}</td>
              <td>
                <EnlaceDeDescarga {...cotizacion.documento} />
              </td>
              <td>{cotizacion.quien}</td>
              {puedeEscribir ? (
                <td>
                  <Enlace
                    href={`${ruta}?anular=${cotizacion.id}`}
                    scroll={false}
                  >
                    Anular
                  </Enlace>
                </td>
              ) : null}
            </tr>
          ))}
        </Tabla>
      )}
      {puedeEscribir && typeof parametros.cotizacion === "string" ? (
        <VentanaDeCarga servicioId={servicioId} rutaAlCerrar={ruta} />
      ) : null}
      {puedeEscribir && typeof aAnular === "string" ? (
        <VentanaDeAnulacion
          servicioId={servicioId}
          cotizacion={cotizaciones.find(({ id }) => id === aAnular)}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </section>
  );
}
