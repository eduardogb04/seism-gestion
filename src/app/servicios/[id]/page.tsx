/**
 * La pantalla de un servicio (F2-04, ADR 0033): sus datos, el cambio de
 * estado, los sitios que abarca y su historial. La edición (`?editar=1`) y la
 * baja (`?baja=1`) son ventanas sobre esta misma pantalla, como en los ABM.
 */

import {
  type DetalleDeServicio,
  ROLES_QUE_ESCRIBEN_SERVICIOS,
} from "../../../casos-uso/servicios/servicios.ts";
import {
  codigoDeError,
  pantallaDeCodigo,
} from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { Boton, clasesDeBoton } from "../../_ui/boton.tsx";
import { CampoTexto, CasillaSiNo } from "../../_ui/campo-texto.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Marco } from "../../_ui/marco.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import type { PropsListado } from "../../catalogo/_abm/paginas.tsx";
import {
  cambiarEstadoDeServicio,
  darDeBajaServicio,
  guardarServicio,
  guardarSitiosDeServicio,
} from "../acciones.ts";

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

function CambiarEstado({
  servicio: { id, transiciones },
}: {
  readonly servicio: DetalleDeServicio;
}) {
  if (transiciones.length === 0) {
    return null;
  }
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Cambiar estado</h2>
      <form
        action={cambiarEstadoDeServicio.bind(null, id)}
        className="flex max-w-xl flex-col gap-3"
      >
        <CampoTexto
          etiqueta="Nota (opcional)"
          type="text"
          name="nota"
          maxLength={500}
        />
        <div className="flex flex-wrap gap-2">
          {transiciones.map(({ valor, etiqueta }) => (
            <Boton
              key={valor}
              variante="secundario"
              type="submit"
              name="a"
              value={valor}
            >
              Pasar a «{etiqueta}»
            </Boton>
          ))}
        </div>
      </form>
    </section>
  );
}

function Sitios({
  servicio: { id, sitios },
  puedeEscribir,
}: {
  readonly servicio: DetalleDeServicio;
  readonly puedeEscribir: boolean;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Sitios que abarca</h2>
      {sitios.length === 0 ? (
        <p>Su cliente no tiene sitios cargados.</p>
      ) : (
        <form
          action={guardarSitiosDeServicio.bind(null, id)}
          className="flex flex-col gap-2"
        >
          {sitios.map((sitio) => (
            <CasillaSiNo
              key={sitio.id}
              etiqueta={sitio.nombre}
              name="sitio"
              value={sitio.id}
              defaultChecked={sitio.marcado}
              disabled={!puedeEscribir}
            />
          ))}
          {puedeEscribir ? (
            <div>
              <Boton variante="primario" type="submit">
                Guardar sitios
              </Boton>
            </div>
          ) : null}
        </form>
      )}
    </section>
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
      <Tabla cabeceras={["Cuándo", "De", "A", "Quién", "Nota"]}>
        {historial.map(({ posicion, cuando, de, a, quien, nota }) => (
          <tr key={posicion}>
            <td>{cuando}</td>
            <td>{de}</td>
            <td>{a}</td>
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
  return (
    <Marco email={email} rol={rol} rutaActual={LISTADO}>
      <main>
        <p className="mb-2">
          <a href={LISTADO}>Volver a Servicios</a>
        </p>
        <h1>
          {servicio.codigo} · {servicio.titulo}
        </h1>
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
        {puedeEscribir ? (
          <>
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
            <CambiarEstado servicio={servicio} />
          </>
        ) : null}
        <Sitios servicio={servicio} puedeEscribir={puedeEscribir} />
        <Historial historial={servicio.historial} />
      </main>
      {puedeEscribir && typeof parametros.editar === "string" ? (
        <VentanaDeEdicion id={servicio.id} rutaAlCerrar={ruta} />
      ) : null}
      {puedeEscribir && typeof parametros.baja === "string" ? (
        <VentanaDeBaja servicio={servicio} rutaAlCerrar={ruta} />
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
