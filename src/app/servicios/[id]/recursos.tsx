/**
 * La sección *Recursos* de la pantalla de un servicio (F3-02): personas,
 * camiones y equipos asignados. Se cargan (`?recurso=1`, una ventana sobre
 * esta misma pantalla) en «Adjudicado» y en «En ejecución»; en las demás
 * etapas se ven y nada más.
 */

import type { DetalleDePlanificacion } from "../../../casos-uso/servicios/planificacion.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { Boton, clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { cargarRecurso, quitarRecurso } from "../acciones.ts";

async function VentanaDeRecurso({
  servicioId,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly rutaAlCerrar: string;
}) {
  const { campos, elegibles, escrito } =
    await armado().planificacion.formularioDeRecurso();
  return (
    <Ventana titulo="Nuevo recurso" rutaAlCerrar={rutaAlCerrar}>
      <FormularioAbm
        accion={cargarRecurso.bind(null, servicioId)}
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
                <td>
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
        <VentanaDeRecurso servicioId={servicioId} rutaAlCerrar={ruta} />
      ) : null}
    </section>
  );
}
