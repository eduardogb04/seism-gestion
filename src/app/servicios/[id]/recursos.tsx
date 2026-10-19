/**
 * La sección *Recursos* de la pantalla de un servicio (F3-02): personas,
 * camiones y equipos asignados. Se cargan (`?recurso=1`, `?editarRecurso=<id>`,
 * ventanas sobre esta misma pantalla) en «Adjudicado» y en «En ejecución»; en
 * las demás etapas se ven y nada más.
 */

import type { DetalleDePlanificacion } from "../../../casos-uso/servicios/planificacion.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { Boton, clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { cargarRecurso, guardarRecurso, quitarRecurso } from "../acciones.ts";

async function VentanaDeRecurso({
  servicioId,
  id,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  /** `undefined`: es un recurso nuevo. */
  readonly id: string | undefined;
  readonly rutaAlCerrar: string;
}) {
  const { campos, elegibles, escrito } =
    await armado().planificacion.formularioDeRecurso(id);
  return (
    <Ventana
      titulo={id === undefined ? "Nuevo recurso" : "Edición de recurso"}
      rutaAlCerrar={rutaAlCerrar}
    >
      <FormularioAbm
        accion={
          id === undefined
            ? cargarRecurso.bind(null, servicioId)
            : guardarRecurso.bind(null, servicioId, id)
        }
        campos={campos}
        elegibles={elegibles}
        inicial={{ escrito, errores: {} }}
        enviar={{ texto: "Guardar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

export function Recursos({
  servicioId,
  detalle: { recursos, planificable },
  ruta,
  puedeEscribir,
  parametros,
}: {
  readonly servicioId: string;
  readonly detalle: DetalleDePlanificacion;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const puedeCargar = puedeEscribir && planificable;
  const aEditar = parametros.editarRecurso;
  const cabeceras = ["Tipo", "Detalle", "Desde", "Hasta"];
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
        <Tabla cabeceras={puedeCargar ? [...cabeceras, "Acciones"] : cabeceras}>
          {recursos.map((recurso) => (
            <tr key={recurso.id}>
              <td>{recurso.tipo}</td>
              <td>{recurso.detalle}</td>
              <td>{recurso.desde}</td>
              <td>{recurso.hasta}</td>
              {puedeCargar ? (
                <td className="flex flex-wrap gap-2">
                  <Enlace
                    href={`${ruta}?editarRecurso=${recurso.id}`}
                    scroll={false}
                  >
                    Editar
                  </Enlace>
                  <form
                    action={quitarRecurso.bind(null, servicioId, recurso.id)}
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
      )}
      {puedeCargar && typeof parametros.recurso === "string" ? (
        <VentanaDeRecurso
          servicioId={servicioId}
          id={undefined}
          rutaAlCerrar={ruta}
        />
      ) : null}
      {puedeCargar &&
      typeof aEditar === "string" &&
      recursos.some(({ id }) => id === aEditar) ? (
        <VentanaDeRecurso
          servicioId={servicioId}
          id={aEditar}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </section>
  );
}
