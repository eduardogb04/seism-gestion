/**
 * La pantalla de un grupo (F3-09): sus datos y sus clientes, con agregar uno
 * (si ya tiene otro grupo, una ventana pide confirmar el movimiento,
 * `?mover=<cliente>`) y sacarlo (`?sacar=<cliente>`). HTML del servidor.
 */

import type { ReactNode } from "react";
import type { PantallaDeGrupo } from "../../../../casos-uso/abm/clientes-de-grupo.ts";
import type { CampoAbm } from "../../../../casos-uso/abm/definicion.ts";
import { GRUPOS } from "../../../../casos-uso/abm/grupos.ts";
import {
  codigoDeError,
  pantallaDeCodigo,
} from "../../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../../_ui/boton.tsx";
import { Enlace } from "../../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../../_ui/formulario-abm.tsx";
import { Marco } from "../../../_ui/marco.tsx";
import { Tabla } from "../../../_ui/tabla.tsx";
import { Ventana } from "../../../_ui/ventana.tsx";
import { sesionExigida } from "../../../(auth)/sesion-actual.ts";
import {
  agregarClienteAlGrupo,
  moverClienteAlGrupo,
  sacarClienteDelGrupo,
} from "../acciones.ts";

type Props = {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const CAMPO_CLIENTE: CampoAbm = {
  tipo: "relacion",
  etiqueta: "Cliente o proveedor",
  entidad: "Cliente",
  mostrar: "razonSocial",
  obligatoria: true,
};

function Clientes({
  pantalla,
  rutaDelGrupo,
  puedeEscribir,
}: {
  readonly pantalla: PantallaDeGrupo;
  readonly rutaDelGrupo: string;
  readonly puedeEscribir: boolean;
}) {
  if (pantalla.clientes.length === 0) {
    return <p>Todavía no tiene clientes.</p>;
  }
  return (
    <Tabla
      cabeceras={[
        "Razón social",
        "CUIT",
        ...(puedeEscribir ? ["Acciones"] : []),
      ]}
    >
      {pantalla.clientes.map(({ id, razonSocial, cuit }) => (
        <tr key={id}>
          <td>{razonSocial}</td>
          <td>{cuit}</td>
          {puedeEscribir ? (
            <td>
              <Enlace
                href={`${rutaDelGrupo}?sacar=${id}`}
                scroll={false}
                className={clasesDeBoton("peligro")}
              >
                Sacar del grupo
              </Enlace>
            </td>
          ) : null}
        </tr>
      ))}
    </Tabla>
  );
}

export default async function ClientesDeUnGrupo({
  params,
  searchParams,
}: Props) {
  const sesion = await sesionExigida();
  const { id } = await params;
  const { mover, sacar } = await searchParams;
  const { email, rol } = sesion.usuario;
  const rutaDelGrupo = `${GRUPOS.ruta}/${id}`;
  const puedeEscribir = GRUPOS.rolesQueEscriben.includes(rol);

  let contenido: ReactNode;
  try {
    const pantalla = await armado().clientesDeGrupo.pantalla(id);
    const aMover = pantalla.candidatos.find(
      (candidato) => candidato.id === mover,
    );
    const aSacar = pantalla.clientes.find((cliente) => cliente.id === sacar);
    contenido = (
      <>
        <h1>{pantalla.grupo.nombre}</h1>
        {pantalla.grupo.observaciones === null ? null : (
          <p className="mb-4 whitespace-pre-line">
            {pantalla.grupo.observaciones}
          </p>
        )}
        <h2 className="mb-2 text-xl font-semibold">Clientes</h2>
        <Clientes
          pantalla={pantalla}
          rutaDelGrupo={rutaDelGrupo}
          puedeEscribir={puedeEscribir}
        />
        {puedeEscribir ? (
          <section className="mt-6">
            <h2 className="mb-2 text-xl font-semibold">Agregar un cliente</h2>
            <FormularioAbm
              accion={agregarClienteAlGrupo.bind(null, id)}
              campos={[["clienteId", CAMPO_CLIENTE]]}
              elegibles={{
                clienteId: pantalla.candidatos.map((candidato) => ({
                  valor: candidato.id,
                  texto:
                    candidato.grupo === null
                      ? candidato.razonSocial
                      : `${candidato.razonSocial} (en ${candidato.grupo})`,
                })),
              }}
              inicial={{ escrito: {}, errores: {} }}
              enviar={{ texto: "Agregar", variante: "primario" }}
              rutaAlCancelar={rutaDelGrupo}
            />
          </section>
        ) : null}
        {puedeEscribir && aMover !== undefined && aMover.grupo !== null ? (
          <Ventana titulo="Mover un cliente" rutaAlCerrar={rutaDelGrupo}>
            <p>
              {aMover.razonSocial} está en {aMover.grupo}. ¿Moverlo a{" "}
              {pantalla.grupo.nombre}?
            </p>
            <FormularioAbm
              accion={moverClienteAlGrupo.bind(null, id, aMover.id)}
              campos={[]}
              elegibles={{}}
              inicial={{ escrito: {}, errores: {} }}
              enviar={{ texto: "Confirmar movimiento", variante: "primario" }}
              rutaAlCancelar={rutaDelGrupo}
            />
          </Ventana>
        ) : null}
        {puedeEscribir && aSacar !== undefined ? (
          <Ventana titulo="Sacar un cliente" rutaAlCerrar={rutaDelGrupo}>
            <p>
              ¿Sacar a {aSacar.razonSocial} de {pantalla.grupo.nombre}?
            </p>
            <FormularioAbm
              accion={sacarClienteDelGrupo.bind(null, id, aSacar.id)}
              campos={[]}
              elegibles={{}}
              inicial={{ escrito: {}, errores: {} }}
              enviar={{ texto: "Confirmar", variante: "peligro" }}
              rutaAlCancelar={rutaDelGrupo}
            />
          </Ventana>
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
    <Marco email={email} rol={rol} rutaActual={GRUPOS.ruta}>
      <main>{contenido}</main>
    </Marco>
  );
}
