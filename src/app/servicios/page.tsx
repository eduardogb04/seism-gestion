import { ROLES_QUE_ESCRIBEN_SERVICIOS } from "../../casos-uso/servicios/servicios.ts";
import { armado } from "../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../_ui/boton.tsx";
import { Enlace } from "../_ui/enlace-next.ts";
import { FormularioAbm } from "../_ui/formulario-abm.tsx";
import { enlace, ListadoAbm, vistaDe } from "../_ui/listado-abm.tsx";
import { Marco } from "../_ui/marco.tsx";
import { Ventana } from "../_ui/ventana.tsx";
import { sesionExigida } from "../(auth)/sesion-actual.ts";
import type { PropsListado } from "../catalogo/_abm/paginas.tsx";
import { crearServicio } from "./acciones.ts";

const RUTA = "/servicios";

export default async function Servicios({ searchParams }: PropsListado) {
  const sesion = await sesionExigida();
  const parametros = await searchParams;
  const listado = await armado().servicios.listar(parametros);
  const { email, rol } = sesion.usuario;
  const puedeEscribir = ROLES_QUE_ESCRIBEN_SERVICIOS.includes(rol);
  return (
    <Marco email={email} rol={rol} rutaActual={RUTA}>
      <main>
        <h1>Servicios</h1>
        <ListadoAbm
          ruta={RUTA}
          singular="servicio"
          cabeceras={listado.cabeceras}
          ordenes={listado.ordenes}
          listado={listado}
          puedeEscribir={puedeEscribir}
          acciones={(id) => (
            <Enlace
              href={`${RUTA}/${id}`}
              className={clasesDeBoton("secundario")}
            >
              Ver
            </Enlace>
          )}
        />
      </main>
      {puedeEscribir && typeof parametros.nuevo === "string" ? (
        <VentanaDeAlta rutaAlCerrar={enlace(RUTA, vistaDe(listado))} />
      ) : null}
    </Marco>
  );
}

async function VentanaDeAlta({
  rutaAlCerrar,
}: {
  readonly rutaAlCerrar: string;
}) {
  const { campos, elegibles, escrito } = await armado().servicios.formulario();
  return (
    <Ventana titulo="Alta de servicio" rutaAlCerrar={rutaAlCerrar}>
      <FormularioAbm
        accion={crearServicio}
        campos={campos}
        elegibles={elegibles}
        inicial={{ escrito, errores: {} }}
        enviar={{ texto: "Guardar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}
