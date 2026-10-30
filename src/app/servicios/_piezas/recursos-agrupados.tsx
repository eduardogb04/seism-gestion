/**
 * Los recursos de un servicio (F3-02, F6-02), agrupados en *Humanos* (las
 * personas) y *Materiales* (camiones, equipos y materiales). Recibe los datos y
 * las acciones por props, para que el panel de cada etapa la ponga. Se cargan
 * (`?recurso=1`, una ventana sobre la misma pantalla) y se quitan en
 * «Adjudicado» y en «En ejecución»; en las demás etapas se ven y nada más.
 */

import type { DetalleDePlanificacion } from "../../../casos-uso/servicios/planificacion.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { Boton, clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import {
  type EstadoFormulario,
  FormularioAbm,
} from "../../_ui/formulario-abm.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Ventana } from "../../_ui/ventana.tsx";

export type AccionesDeRecursos = {
  readonly cargar: (
    servicioId: string,
    previo: EstadoFormulario,
    formulario: FormData,
  ) => Promise<EstadoFormulario>;
  readonly quitar: (servicioId: string, id: string) => Promise<void>;
};

const GRUPOS = [
  { grupo: "humanos", titulo: "Humanos" },
  { grupo: "materiales", titulo: "Materiales" },
] as const;

async function VentanaDeRecurso({
  servicioId,
  cargar,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly cargar: AccionesDeRecursos["cargar"];
  readonly rutaAlCerrar: string;
}) {
  const { campos, elegibles, escrito } =
    await armado().planificacion.formularioDeRecurso();
  return (
    <Ventana titulo="Nuevo recurso" rutaAlCerrar={rutaAlCerrar}>
      <FormularioAbm
        accion={cargar.bind(null, servicioId)}
        campos={campos}
        elegibles={elegibles}
        inicial={{ escrito, errores: {} }}
        enviar={{ texto: "Guardar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

export function RecursosAgrupados({
  servicioId,
  detalle: { recursos, planificable },
  acciones,
  ruta,
  puedeEscribir,
  parametros,
}: {
  readonly servicioId: string;
  readonly detalle: DetalleDePlanificacion;
  readonly acciones: AccionesDeRecursos;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const puedeCargar = puedeEscribir && planificable;
  const cabeceras = ["Tipo", "Detalle", "Cantidad", "Desde", "Hasta"];
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Recursos</h2>
      {puedeCargar ? (
        <p className="mb-3">
          <Enlace
            href={`${ruta}?recurso=1`}
            scroll={false}
            className={clasesDeBoton("primario")}
          >
            Nuevo recurso
          </Enlace>
        </p>
      ) : null}
      {recursos.length === 0 ? (
        <p>Todavía no hay recursos cargados.</p>
      ) : (
        GRUPOS.map(({ grupo, titulo }) => {
          const delGrupo = recursos.filter(
            (recurso) => recurso.grupo === grupo,
          );
          return delGrupo.length === 0 ? null : (
            <div key={grupo} data-grupo-de-recursos={grupo} className="mb-4">
              <h3 className="mb-2 text-lg font-semibold">{titulo}</h3>
              <Tabla
                cabeceras={puedeCargar ? [...cabeceras, "Acciones"] : cabeceras}
              >
                {delGrupo.map((recurso) => (
                  <tr key={recurso.id}>
                    <td>{recurso.tipo}</td>
                    <td>{recurso.detalle}</td>
                    <td>{recurso.cantidad}</td>
                    <td>{recurso.desde}</td>
                    <td>{recurso.hasta}</td>
                    {puedeCargar ? (
                      <td>
                        <form
                          action={acciones.quitar.bind(
                            null,
                            servicioId,
                            recurso.id,
                          )}
                        >
                          <Boton variante="peligro" type="submit">
                            Quitar
                          </Boton>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </Tabla>
            </div>
          );
        })
      )}
      {puedeCargar && typeof parametros.recurso === "string" ? (
        <VentanaDeRecurso
          servicioId={servicioId}
          cargar={acciones.cargar}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </section>
  );
}
