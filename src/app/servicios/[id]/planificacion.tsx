/**
 * La sección *Planificación* de la pantalla de un servicio (F3-02): el
 * responsable y la fecha estimada de inicio. Se cambian (`?planificar=1`, una
 * ventana sobre esta misma pantalla) en «Adjudicado» y en «En ejecución»; en
 * las demás etapas se ven y nada más.
 */

import type { DetalleDePlanificacion } from "../../../casos-uso/servicios/planificacion.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { guardarPlanificacionDeServicio } from "../acciones.ts";

async function VentanaDePlanificacion({
  servicioId,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly rutaAlCerrar: string;
}) {
  const { campos, escrito } =
    await armado().planificacion.formularioDePlanificacion(servicioId);
  return (
    <Ventana titulo="Planificación" rutaAlCerrar={rutaAlCerrar}>
      <FormularioAbm
        accion={guardarPlanificacionDeServicio.bind(null, servicioId)}
        campos={campos}
        elegibles={{}}
        inicial={{ escrito, errores: {} }}
        enviar={{ texto: "Guardar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

export function Planificacion({
  servicioId,
  detalle,
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
  const puedeCambiar = puedeEscribir && detalle.planificable;
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Planificación</h2>
      <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="font-medium">Responsable</dt>
        <dd>{detalle.responsable}</dd>
        <dt className="font-medium">Fecha estimada de inicio</dt>
        <dd>
          {detalle.fechaInicioEstimada === ""
            ? "Sin cargar"
            : detalle.fechaInicioEstimada}
        </dd>
      </dl>
      {puedeCambiar ? (
        <p>
          <Enlace
            href={`${ruta}?planificar=1`}
            scroll={false}
            className={clasesDeBoton("secundario")}
          >
            Cambiar planificación
          </Enlace>
        </p>
      ) : null}
      {puedeCambiar && typeof parametros.planificar === "string" ? (
        <VentanaDePlanificacion servicioId={servicioId} rutaAlCerrar={ruta} />
      ) : null}
    </section>
  );
}
