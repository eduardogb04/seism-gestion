/**
 * Lo fijo del servicio en todas sus etapas (F6-01, ADR 0048): el encabezado
 * con sus datos, el estado y la línea de etapas; al costado (debajo en
 * pantallas angostas) las observaciones y sucesos; y el historial de estados,
 * plegado. El panel de cada etapa es la página. Un layout no recibe los
 * parámetros de la dirección: sus botones abren las ventanas en el panel de la
 * etapa actual, que las dibuja.
 */

import { Building2, History, MapPin, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import {
  type DetalleDeServicio,
  ROLES_QUE_ESCRIBEN_SERVICIOS,
} from "../../../casos-uso/servicios/servicios.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { Marco } from "../../_ui/marco.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import {
  ChipDeEstado,
  esSoloLectura,
  LineaDeEtapas,
} from "./estado-del-servicio.tsx";
import { rutaDeEtapa, servicioDe } from "./rutas.ts";
import { ColumnaDeSucesos } from "./sucesos.tsx";

const LISTADO = "/servicios";

/** Los datos que van en la línea de arriba del encabezado; el resto, debajo. */
const DESTACADOS = ["Cliente", "Tipo de servicio", "Responsable"];

function Encabezado({
  servicio,
  rutaActual,
  puedeEscribir,
}: {
  readonly servicio: DetalleDeServicio;
  readonly rutaActual: string;
  readonly puedeEscribir: boolean;
}) {
  const dato = (etiqueta: string) =>
    servicio.datos.find(([de]) => de === etiqueta)?.[1] ?? "";
  const sitios = servicio.sitios
    .filter(({ marcado }) => marcado)
    .map(({ nombre }) => nombre);
  const otros = servicio.datos.filter(
    ([etiqueta]) => !DESTACADOS.includes(etiqueta),
  );
  return (
    <header className="rounded border border-borde bg-superficie p-5 shadow-sm dark:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm tracking-wide text-texto-suave">
            {dato("Tipo de servicio")}
          </p>
          <h1 className="mt-1 mb-2">
            <span className="text-texto-suave">{servicio.codigo}</span> ·{" "}
            {servicio.titulo}
          </h1>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-texto-suave">
            <li className="inline-flex items-center gap-1.5">
              <Building2 aria-hidden="true" className="size-4" />
              <span className="sr-only">Cliente:</span>
              {dato("Cliente")}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden="true" className="size-4" />
              <span className="sr-only">Sitios:</span>
              {sitios.length === 0 ? "Sin sitios marcados" : sitios.join(" · ")}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <UserRound aria-hidden="true" className="size-4" />
              <span className="sr-only">Responsable:</span>
              {dato("Responsable")}
            </li>
          </ul>
          {servicio.renueva === null ? null : (
            <p data-renueva className="mt-1 text-sm">
              Renueva{" "}
              <Enlace href={`${LISTADO}/${servicio.renueva.id}`}>
                {servicio.renueva.codigo}
              </Enlace>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChipDeEstado servicio={servicio} />
          {puedeEscribir ? (
            <Enlace
              href={`${rutaActual}?editar=1`}
              scroll={false}
              className={clasesDeBoton("secundario")}
            >
              Editar
            </Enlace>
          ) : null}
          {puedeEscribir && servicio.admiteBaja ? (
            <Enlace
              href={`${rutaActual}?baja=1`}
              scroll={false}
              className={clasesDeBoton("discreto")}
            >
              Dar de baja
            </Enlace>
          ) : null}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
        {otros.map(([etiqueta, texto]) => (
          <div key={etiqueta} className="contents">
            <dt className="text-texto-suave">{etiqueta}</dt>
            <dd className="whitespace-pre-line">{texto}</dd>
          </div>
        ))}
      </dl>
      <LineaDeEtapas servicio={servicio} />
    </header>
  );
}

/** El historial de estados, plegado: se abre sin JavaScript propio. */
function Historial({
  historial,
}: {
  readonly historial: DetalleDeServicio["historial"];
}) {
  const cambios = historial.length - 1;
  return (
    <details className="mt-6 rounded border border-borde bg-superficie p-4 shadow-sm dark:shadow-none">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold pointer-coarse:min-h-11">
        <History aria-hidden="true" className="size-5 text-texto-suave" />
        Historial de estados
        <span className="font-normal text-texto-suave">
          · {cambios === 1 ? "1 cambio" : `${cambios} cambios`}
        </span>
      </summary>
      <div className="mt-3">
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
      </div>
    </details>
  );
}

export default async function LayoutDelServicio({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ readonly id: string }>;
}) {
  const sesion = await sesionExigida();
  const { id } = await params;
  const { email, rol } = sesion.usuario;
  const leido = await servicioDe(id);
  if (!leido.ok) {
    return (
      <Marco email={email} rol={rol} rutaActual={LISTADO}>
        <main>
          <ErrorEnPantalla error={pantallaDeCodigo(leido.codigo)} />
          <a href={LISTADO}>Volver a Servicios</a>
        </main>
      </Marco>
    );
  }
  const { servicio } = leido;
  const rutaActual = rutaDeEtapa(servicio.id, servicio.etapa);
  // Lo que se escribe desde el encabezado o la columna va al panel de la etapa actual.
  const puedeEscribir =
    ROLES_QUE_ESCRIBEN_SERVICIOS.includes(rol) &&
    !esSoloLectura(servicio.etapa);
  return (
    <Marco email={email} rol={rol} rutaActual={LISTADO}>
      <main>
        <p className="mb-3 text-sm">
          <a href={LISTADO}>Volver a Servicios</a>
        </p>
        <Encabezado
          servicio={servicio}
          rutaActual={rutaActual}
          puedeEscribir={puedeEscribir}
        />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            {children}
            <Historial historial={servicio.historial} />
          </div>
          <aside aria-label="Observaciones y sucesos">
            <ColumnaDeSucesos
              servicioId={servicio.id}
              ruta={rutaActual}
              puedeEscribir={puedeEscribir}
            />
          </aside>
        </div>
      </main>
    </Marco>
  );
}
