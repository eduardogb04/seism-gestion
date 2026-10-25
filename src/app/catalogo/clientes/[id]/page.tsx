/**
 * La ficha de un cliente (F4-05, ADR 0044): sus datos, de solo lectura, y su
 * traza —los sucesos propios y los de todos sus servicios—, con la carga de uno
 * suelto (`?suceso=1`) y la anulación de uno suelto con su motivo
 * (`?anularSuceso=<id>`) como ventanas sobre esta misma pantalla. La suelta
 * anulada se sigue viendo, tachada y con su motivo; una de servicio se anula en
 * su servicio. HTML del servidor: funciona sin JavaScript.
 */

import type { ReactNode } from "react";
import { CLIENTES } from "../../../../casos-uso/abm/clientes.ts";
import { ROLES_QUE_ESCRIBEN_SERVICIOS } from "../../../../casos-uso/servicios/servicios.ts";
import type { FichaDelCliente } from "../../../../casos-uso/servicios/sucesos.ts";
import {
  codigoDeError,
  pantallaDeCodigo,
} from "../../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../../_ui/boton.tsx";
import { Enlace } from "../../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../../_ui/error-en-pantalla.tsx";
import { Marco } from "../../../_ui/marco.tsx";
import { Tabla } from "../../../_ui/tabla.tsx";
import { sesionExigida } from "../../../(auth)/sesion-actual.ts";
import {
  VentanaDeAnulacion,
  VentanaDeCarga,
} from "../../../servicios/[id]/sucesos.tsx";

type Props = {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function Traza({
  ficha,
  ruta,
  puedeAnular,
}: {
  readonly ficha: FichaDelCliente;
  readonly ruta: string;
  readonly puedeAnular: boolean;
}) {
  if (ficha.situaciones.length === 0) {
    return <p>Todavía no hay sucesos cargados.</p>;
  }
  return (
    <Tabla
      cabeceras={[
        "Fecha",
        "Servicio",
        "Qué pasó",
        "Cargado por",
        ...(puedeAnular ? ["Acciones"] : []),
      ]}
    >
      {ficha.situaciones.map(
        ({ id, fecha, servicio, texto, autor, motivoAnulacion }) => (
          <tr key={id}>
            <td>{fecha}</td>
            <td>
              {servicio === null ? (
                "Sin servicio"
              ) : (
                <Enlace href={`/servicios/${servicio.id}`}>
                  {servicio.codigo}
                </Enlace>
              )}
            </td>
            <td className="whitespace-pre-line">
              {motivoAnulacion === null ? (
                texto
              ) : (
                <>
                  <del>{texto}</del>
                  <br />
                  Anulada: {motivoAnulacion}
                </>
              )}
            </td>
            <td>{autor}</td>
            {puedeAnular ? (
              <td>
                {servicio === null && motivoAnulacion === null ? (
                  <Enlace href={`${ruta}?anularSuceso=${id}`} scroll={false}>
                    Anular
                  </Enlace>
                ) : null}
              </td>
            ) : null}
          </tr>
        ),
      )}
    </Tabla>
  );
}

export default async function FichaDeUnCliente({
  params,
  searchParams,
}: Props) {
  const sesion = await sesionExigida();
  const { id } = await params;
  const { suceso, anularSuceso } = await searchParams;
  const { email, rol } = sesion.usuario;
  const ruta = `${CLIENTES.ruta}/${id}`;
  const puedeCargar = ROLES_QUE_ESCRIBEN_SERVICIOS.includes(rol);

  let contenido: ReactNode;
  try {
    const ficha = await armado().sucesos.delCliente(id);
    contenido = (
      <>
        <p className="mb-2">
          <a href={CLIENTES.ruta}>Volver a {CLIENTES.plural}</a>
        </p>
        <h1>{ficha.razonSocial}</h1>
        <dl className="my-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {ficha.datos.map(([etiqueta, texto]) => (
            <div key={etiqueta} className="contents">
              <dt className="font-medium">{etiqueta}</dt>
              <dd className="whitespace-pre-line">{texto}</dd>
            </div>
          ))}
        </dl>
        {CLIENTES.rolesQueEscriben.includes(rol) ? (
          <p className="mb-4">
            <Enlace
              href={`${CLIENTES.ruta}?editar=${id}`}
              className={clasesDeBoton("secundario")}
            >
              Editar
            </Enlace>
          </p>
        ) : null}
        <h2 className="mb-2 text-xl font-semibold">Sucesos</h2>
        {puedeCargar ? (
          <p className="mb-3">
            <Enlace
              href={`${ruta}?suceso=1`}
              scroll={false}
              className={clasesDeBoton("primario")}
            >
              Nuevo suceso
            </Enlace>
          </p>
        ) : null}
        <Traza ficha={ficha} ruta={ruta} puedeAnular={puedeCargar} />
        {puedeCargar && typeof suceso === "string" ? (
          <VentanaDeCarga
            clienteId={id}
            servicioId={null}
            rutaAlCerrar={ruta}
          />
        ) : null}
        {puedeCargar && typeof anularSuceso === "string" ? (
          <VentanaDeAnulacion
            origen={{ clienteId: id }}
            suceso={ficha.situaciones.find(
              ({ id: de, servicio, motivoAnulacion }) =>
                de === anularSuceso &&
                servicio === null &&
                motivoAnulacion === null,
            )}
            rutaAlCerrar={ruta}
          />
        ) : null}
      </>
    );
  } catch (fallo) {
    const codigo = codigoDeError(fallo);
    if (codigo === null) {
      throw fallo;
    }
    contenido = <ErrorEnPantalla error={pantallaDeCodigo(codigo)} />;
  }
  return (
    <Marco email={email} rol={rol} rutaActual={CLIENTES.ruta}>
      <main>{contenido}</main>
    </Marco>
  );
}
