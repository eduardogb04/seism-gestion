/**
 * La pantalla de un servicio (F2-04, ADR 0033, F3-06): sus datos, el estado,
 * la línea de etapas y, debajo, solo la vista de la etapa actual (o, en solo
 * lectura, de una ya recorrida: `?etapa=`), con los sucesos en una columna
 * lateral y el historial con los días en cada etapa (F3-01). La edición
 * (`?editar=1`), la baja (`?baja=1`) y cada cambio de etapa (`?pasar=`) son
 * ventanas sobre esta misma pantalla, como en los ABM.
 */

import { ETIQUETAS_DE_ESTADO } from "../../../casos-uso/servicios/formulario.ts";
import {
  type DetalleDeServicio,
  ROLES_QUE_ESCRIBEN_SERVICIOS,
} from "../../../casos-uso/servicios/servicios.ts";
import {
  codigoDeError,
  pantallaDeCodigo,
} from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Marco } from "../../_ui/marco.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import type { PropsListado } from "../../catalogo/_abm/paginas.tsx";
import { darDeBajaServicio, guardarServicio } from "../acciones.ts";
import {
  esSoloLectura,
  etapaPasada,
  LineaDeEtapas,
  VistaDeEtapa,
} from "./etapas.tsx";
import { Sucesos } from "./sucesos.tsx";
import { Transiciones, VentanaDeTransicion } from "./transiciones.tsx";

const LISTADO = "/servicios";

type Props = PropsListado & {
  readonly params: Promise<{ readonly id: string }>;
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

function Historial({
  historial,
}: {
  readonly historial: DetalleDeServicio["historial"];
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Historial</h2>
      <Tabla cabeceras={["Cuándo", "De", "A", "Días", "Quién", "Nota"]}>
        {historial.map(({ posicion, cuando, de, a, dias, quien, nota }) => (
          <tr key={posicion}>
            <td>{cuando}</td>
            <td>{de}</td>
            <td>{a}</td>
            <td>{dias}</td>
            <td>{quien}</td>
            <td className="whitespace-pre-line">{nota}</td>
          </tr>
        ))}
      </Tabla>
    </section>
  );
}

export default async function Servicio({ params, searchParams }: Props) {
  const sesion = await sesionExigida();
  const { id } = await params;
  const parametros = await searchParams;
  const { email, rol } = sesion.usuario;
  const puedeEscribir = ROLES_QUE_ESCRIBEN_SERVICIOS.includes(rol);
  let servicio: DetalleDeServicio;
  try {
    servicio = await armado().servicios.ver(id);
  } catch (fallo) {
    const codigo = codigoDeError(fallo);
    if (codigo === null) {
      throw fallo;
    }
    return (
      <Marco email={email} rol={rol} rutaActual={LISTADO}>
        <ErrorEnPantalla error={pantallaDeCodigo(codigo)} />
        <a href={LISTADO}>Volver a Servicios</a>
      </Marco>
    );
  }
  const ruta = `${LISTADO}/${servicio.id}`;
  const pasada = etapaPasada(servicio, parametros.etapa);
  // Una etapa pasada, «Cerrado» y las salidas se miran: no se carga ni se cambia nada.
  const puedeCambiar =
    puedeEscribir && pasada === null && !esSoloLectura(servicio.etapa);
  const etapa = pasada ?? servicio.etapa;
  const delServicio = {
    servicio,
    detalle: await armado().planificacion.ver(servicio.id),
    ruta,
    puedeEscribir: puedeCambiar,
    // Cotizar la renovación no escribe en este servicio: vale también en «Cerrado».
    puedeRenovar: puedeEscribir && pasada === null,
    parametros: pasada === null ? parametros : {},
    etapa,
  };
  return (
    <Marco email={email} rol={rol} rutaActual={LISTADO}>
      <main>
        <p className="mb-2">
          <a href={LISTADO}>Volver a Servicios</a>
        </p>
        <h1>
          {servicio.codigo} · {servicio.titulo}
        </h1>
        {servicio.renueva === null ? null : (
          <p data-renueva>
            Renueva{" "}
            <Enlace href={`${LISTADO}/${servicio.renueva.id}`}>
              {servicio.renueva.codigo}
            </Enlace>
          </p>
        )}
        {typeof parametros.error === "string" ? (
          <ErrorEnPantalla error={pantallaDeCodigo(parametros.error)} />
        ) : null}
        <dl className="my-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <div className="contents">
            <dt className="font-medium">Estado</dt>
            <dd data-estado-del-servicio>{servicio.estado}</dd>
          </div>
          {servicio.datos.map(([etiqueta, texto]) => (
            <div key={etiqueta} className="contents">
              <dt className="font-medium">{etiqueta}</dt>
              <dd className="whitespace-pre-line">{texto}</dd>
            </div>
          ))}
        </dl>
        {puedeCambiar ? (
          <div className="flex flex-wrap gap-2">
            <Enlace
              href={`${ruta}?editar=1`}
              scroll={false}
              className={clasesDeBoton("secundario")}
            >
              Editar
            </Enlace>
            <Enlace
              href={`${ruta}?baja=1`}
              scroll={false}
              className={clasesDeBoton("peligro")}
            >
              Dar de baja
            </Enlace>
          </div>
        ) : null}
        <LineaDeEtapas servicio={servicio} ruta={ruta} />
        {pasada === null ? null : (
          <p data-solo-lectura className="mt-4">
            Solo lectura: esta es la etapa «{ETIQUETAS_DE_ESTADO[pasada]}».{" "}
            <Enlace href={ruta}>Volver a la etapa actual</Enlace>
          </p>
        )}
        {puedeCambiar ? <Transiciones servicio={servicio} ruta={ruta} /> : null}
        <div className="mt-2 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div>
            <VistaDeEtapa {...delServicio} />
          </div>
          <aside aria-label="Registro de sucesos">
            <Sucesos
              clienteId={servicio.clienteId}
              servicioId={servicio.id}
              ruta={ruta}
              puedeEscribir={delServicio.puedeEscribir}
              parametros={delServicio.parametros}
            />
          </aside>
        </div>
        <Historial historial={servicio.historial} />
      </main>
      {puedeCambiar && typeof parametros.editar === "string" ? (
        <VentanaDeEdicion id={servicio.id} rutaAlCerrar={ruta} />
      ) : null}
      {puedeCambiar && typeof parametros.baja === "string" ? (
        <VentanaDeBaja servicio={servicio} rutaAlCerrar={ruta} />
      ) : null}
      {puedeCambiar && typeof parametros.pasar === "string" ? (
        <VentanaDeTransicion
          servicio={servicio}
          destino={parametros.pasar}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </Marco>
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
