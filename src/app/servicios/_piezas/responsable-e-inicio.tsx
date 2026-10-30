/**
 * El responsable y la fecha estimada de inicio (F6-04), que se cargan en el
 * panel de «Adjudicado» mismo: un selector de usuario, una fecha y «Guardar».
 * Es la carga `planificacion`: el resto del servicio queda como está.
 */

import { armado } from "../../../infraestructura/arranque/armado.ts";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { TituloDeParte } from "../../_ui/panel.tsx";
import { guardarPlanificacionDeServicio } from "../acciones.ts";

const CAMPOS = ["responsableId", "fechaInicioEstimada"];

export async function ResponsableEInicio({
  servicioId,
  ruta,
}: {
  readonly servicioId: string;
  readonly ruta: string;
}) {
  const { campos, elegibles, escrito } =
    await armado().servicios.formulario(servicioId);
  return (
    <section data-carga="planificacion">
      <TituloDeParte>Responsable e inicio estimado</TituloDeParte>
      <FormularioAbm
        accion={guardarPlanificacionDeServicio.bind(null, servicioId)}
        campos={campos.filter(([nombre]) => CAMPOS.includes(nombre))}
        elegibles={elegibles}
        inicial={{ escrito, errores: {} }}
        enviar={{ texto: "Guardar", variante: "primario" }}
        rutaAlCancelar={ruta}
      />
    </section>
  );
}
