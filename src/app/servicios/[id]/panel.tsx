/**
 * Lo que hace cada página de etapa (F6-01, ADR 0048): decide qué etapa muestra
 * (la actual, editable; una recorrida, en solo lectura; una futura redirige a
 * la actual), dibuja su panel y las ventanas que piden los parámetros de la
 * dirección (`?editar=1`, `?baja=1`, `?pasar=`, `?suceso=1`, `?anularSuceso=`),
 * que el layout no recibe.
 */

import { redirect } from "next/navigation.js";
import { ETIQUETAS_DE_ESTADO } from "../../../casos-uso/servicios/formulario.ts";
import {
  type DetalleDeServicio,
  ROLES_QUE_ESCRIBEN_SERVICIOS,
} from "../../../casos-uso/servicios/servicios.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import type { Rol } from "../../../puertos/repositorios/usuarios.ts";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { darDeBajaServicio, guardarServicio } from "../acciones.ts";
import type { DatosDePanel, Parametros } from "./datos-de-panel.ts";
import { esSoloLectura, VistaDeEtapa } from "./etapas.tsx";
import { PanelCotizado } from "./panel-cotizado.tsx";
import { PanelCreado } from "./panel-creado.tsx";
import {
  etapaDeLaRuta,
  rutaDeEtapa,
  type Segmento,
  servicioDe,
} from "./rutas.ts";
import { VentanaDeAnulacion, VentanaDeCarga } from "./sucesos.tsx";
import { Transiciones, VentanaDeTransicion } from "./transiciones.tsx";

export type PropsDeEtapa = {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<Parametros>;
};

function VentanaDeBaja({
  servicio: { id, codigo, titulo, admiteBaja },
  rutaAlCerrar,
}: {
  readonly servicio: DetalleDeServicio;
  readonly rutaAlCerrar: string;
}) {
  return (
    <Ventana titulo="Baja de servicio" rutaAlCerrar={rutaAlCerrar}>
      {admiteBaja ? (
        <>
          <p className="mb-4">
            Confirmá la baja de {codigo} · {titulo}.
          </p>
          <FormularioAbm
            accion={darDeBajaServicio.bind(null, id)}
            campos={[]}
            elegibles={{}}
            inicial={{ escrito: {}, errores: {} }}
            enviar={{ texto: "Confirmar baja", variante: "peligro" }}
            rutaAlCancelar={rutaAlCerrar}
          />
        </>
      ) : (
        <ErrorEnPantalla error={pantallaDeCodigo("DOM-0011")} />
      )}
    </Ventana>
  );
}

async function VentanaDeEdicion({
  id,
  rutaAlCerrar,
}: {
  readonly id: string;
  readonly rutaAlCerrar: string;
}) {
  const { campos, elegibles, escrito } =
    await armado().servicios.formulario(id);
  return (
    <Ventana titulo="Edición de servicio" rutaAlCerrar={rutaAlCerrar}>
      <FormularioAbm
        accion={guardarServicio.bind(null, id)}
        campos={campos}
        elegibles={elegibles}
        inicial={{ escrito, errores: {} }}
        enviar={{ texto: "Guardar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

async function VentanasDelServicio({
  servicio,
  ruta,
  parametros,
}: {
  readonly servicio: DetalleDeServicio;
  readonly ruta: string;
  readonly parametros: Parametros;
}) {
  const aAnular = parametros.anularSuceso;
  return (
    <>
      {typeof parametros.editar === "string" ? (
        <VentanaDeEdicion id={servicio.id} rutaAlCerrar={ruta} />
      ) : null}
      {typeof parametros.baja === "string" ? (
        <VentanaDeBaja servicio={servicio} rutaAlCerrar={ruta} />
      ) : null}
      {typeof parametros.pasar === "string" ? (
        <VentanaDeTransicion
          servicio={servicio}
          destino={parametros.pasar}
          rutaAlCerrar={ruta}
        />
      ) : null}
      {typeof parametros.suceso === "string" ? (
        <VentanaDeCarga
          clienteId={servicio.clienteId}
          servicioId={servicio.id}
          rutaAlCerrar={ruta}
        />
      ) : null}
      {typeof aAnular === "string" ? (
        <VentanaDeAnulacion
          origen={{ servicioId: servicio.id }}
          suceso={(await armado().sucesos.listar(servicio.id)).find(
            ({ id }) => id === aAnular,
          )}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </>
  );
}

export async function PaginaDeEtapa({
  segmento,
  rol,
  params,
  searchParams,
}: PropsDeEtapa & { readonly segmento: Segmento; readonly rol: Rol }) {
  const { id } = await params;
  const leido = await servicioDe(id);
  if (!leido.ok) {
    // El layout ya muestra el error.
    return null;
  }
  const { servicio } = leido;
  const rutaActual = rutaDeEtapa(servicio.id, servicio.etapa);
  const vista = etapaDeLaRuta(servicio, segmento);
  if (vista === null) {
    redirect(rutaActual);
  }
  const rolEscribe = ROLES_QUE_ESCRIBEN_SERVICIOS.includes(rol);
  const parametros = vista.soloLectura ? {} : await searchParams;
  const datos: DatosDePanel = {
    servicio,
    ruta: rutaDeEtapa(servicio.id, vista.etapa),
    puedeEscribir:
      rolEscribe && !vista.soloLectura && !esSoloLectura(servicio.etapa),
    soloLectura: vista.soloLectura,
    parametros,
  };
  return (
    <>
      {typeof parametros.error === "string" ? (
        <ErrorEnPantalla error={pantallaDeCodigo(parametros.error)} />
      ) : null}
      {vista.soloLectura ? (
        <p
          data-solo-lectura
          className="mb-4 rounded border border-borde-control bg-superficie-alta p-3"
        >
          <strong>Solo lectura:</strong> esta es la etapa «
          {ETIQUETAS_DE_ESTADO[vista.etapa]}», que el servicio ya pasó.{" "}
          <Enlace href={rutaActual}>Volver a la etapa actual</Enlace>
        </p>
      ) : null}
      {vista.etapa === "creado" ? (
        <PanelCreado {...datos} />
      ) : vista.etapa === "cotizado" ? (
        <PanelCotizado {...datos} />
      ) : (
        <>
          {datos.puedeEscribir ? (
            <Transiciones servicio={servicio} ruta={datos.ruta} />
          ) : null}
          <VistaDeEtapa
            {...datos}
            etapa={vista.etapa}
            detalle={await armado().planificacion.ver(servicio.id)}
            // Cotizar la renovación no escribe en este servicio: vale también en «Cerrado».
            puedeRenovar={rolEscribe && !vista.soloLectura}
          />
        </>
      )}
      {datos.puedeEscribir ? (
        <VentanasDelServicio
          servicio={servicio}
          ruta={datos.ruta}
          parametros={parametros}
        />
      ) : null}
    </>
  );
}
