/**
 * La pantalla de un egreso (F2-09, F3-07): sus datos y su trazabilidad —el
 * comprobante, lo pagado y el saldo, los pagos y los cambios del egreso— y el
 * botón «Registrar pago», que abre la misma ventana que el listado
 * (`?pagar=<id>`). Anular un pago es otra ventana sobre la misma pantalla
 * (`?anular=<id>`), como la baja del molde de ABM. HTML del servidor: funciona
 * sin JavaScript.
 */

import type { ReactNode } from "react";
import { EGRESOS } from "../../../casos-uso/abm/egresos.ts";
import type { DetalleEgreso } from "../../../casos-uso/egresos/pagos.ts";
import {
  codigoDeError,
  pantallaDeCodigo,
} from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { Cambios } from "../../_ui/cambios.tsx";
import { EnlaceDeDescarga } from "../../_ui/enlace-de-descarga.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Marco } from "../../_ui/marco.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { VentanaDePago } from "../../_ui/ventana-de-movimiento.tsx";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import { anularPagoDeEgreso } from "../acciones.ts";

type Props = {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function Resumen({ detalle }: { readonly detalle: DetalleEgreso }) {
  return (
    <>
      <dl className="my-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {detalle.datos.map(({ etiqueta, valor }) => (
          <div key={etiqueta} className="contents">
            <dt className="font-medium">{etiqueta}</dt>
            <dd className="whitespace-pre-line">{valor}</dd>
          </div>
        ))}
        {detalle.comprobante === null ? null : (
          <div className="contents">
            <dt className="font-medium">Comprobante adjunto</dt>
            <dd>
              <EnlaceDeDescarga
                id={detalle.comprobante.id}
                nombre={detalle.comprobante.nombre}
                tamano={detalle.comprobante.tamano}
              />
            </dd>
          </div>
        )}
      </dl>
      <p className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-lg">
        <span>
          Total: <strong>{detalle.total}</strong>
        </span>
        <span>
          Pagado: <strong data-pagado>{detalle.pagado}</strong>
        </span>
        <span>
          Saldo: <strong data-saldo>{detalle.saldo}</strong>
        </span>
        {detalle.saldado ? (
          <strong data-estado-pagado className="text-exito">
            Pagado
          </strong>
        ) : null}
      </p>
    </>
  );
}

function Pagos({
  detalle,
  rutaDelEgreso,
  puedeEscribir,
}: {
  readonly detalle: DetalleEgreso;
  readonly rutaDelEgreso: string;
  readonly puedeEscribir: boolean;
}) {
  if (detalle.pagos.length === 0) {
    return <p>Todavía no tiene pagos.</p>;
  }
  return (
    <Tabla
      cabeceras={[
        "Fecha",
        "Importe",
        "Cuenta",
        "Salió de la cuenta",
        "Tipo de cambio",
        "Observaciones",
        "Cargó",
        ...(puedeEscribir ? ["Acciones"] : []),
      ]}
    >
      {detalle.pagos.map((pago) => (
        <tr key={pago.id}>
          <td>{pago.fecha}</td>
          <td>{pago.importe}</td>
          <td>{pago.cuenta}</td>
          <td>{pago.salida}</td>
          <td>{pago.cambio}</td>
          <td className="whitespace-pre-line">{pago.observaciones}</td>
          <td>{pago.quien}</td>
          {puedeEscribir ? (
            <td>
              <Enlace
                href={`${rutaDelEgreso}?anular=${pago.id}`}
                scroll={false}
                className={clasesDeBoton("peligro")}
              >
                Anular
              </Enlace>
            </td>
          ) : null}
        </tr>
      ))}
    </Tabla>
  );
}

export default async function PagosDeUnEgreso({ params, searchParams }: Props) {
  const sesion = await sesionExigida();
  const { id } = await params;
  const parametros = await searchParams;
  const { email, rol } = sesion.usuario;
  const rutaDelEgreso = `/egresos/${id}`;
  const puedeEscribir = EGRESOS.rolesQueEscriben.includes(rol);
  const anular =
    typeof parametros.anular === "string" ? parametros.anular : null;
  const pagar = typeof parametros.pagar === "string" ? parametros.pagar : null;

  let contenido: ReactNode;
  try {
    const detalle = await armado().pagos.detalle(id);
    const aAnular =
      anular === null
        ? undefined
        : detalle.pagos.find((pago) => pago.id === anular);
    contenido = (
      <>
        <h1>{detalle.concepto}</h1>
        <Resumen detalle={detalle} />
        {puedeEscribir && !detalle.saldado ? (
          <p className="mb-4">
            <Enlace
              href={`${rutaDelEgreso}?pagar=${id}`}
              scroll={false}
              className={clasesDeBoton("primario")}
            >
              Registrar pago
            </Enlace>
          </p>
        ) : null}
        <h2 className="mb-2 text-xl font-semibold">Pagos</h2>
        <Pagos
          detalle={detalle}
          rutaDelEgreso={rutaDelEgreso}
          puedeEscribir={puedeEscribir}
        />
        <Cambios cambios={await armado().abm.historial(EGRESOS, id)} />
        {puedeEscribir && pagar !== null ? (
          <VentanaDePago egresoId={pagar} rutaAlCerrar={rutaDelEgreso} />
        ) : null}
        {puedeEscribir && aAnular !== undefined ? (
          <Ventana titulo="Anular un pago" rutaAlCerrar={rutaDelEgreso}>
            <p>Confirmá que anulás este pago: el saldo del egreso vuelve.</p>
            <dl className="my-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="font-medium">Fecha</dt>
              <dd>{aAnular.fecha}</dd>
              <dt className="font-medium">Importe</dt>
              <dd>{aAnular.importe}</dd>
              <dt className="font-medium">Cuenta</dt>
              <dd>{aAnular.cuenta}</dd>
            </dl>
            <FormularioAbm
              accion={anularPagoDeEgreso.bind(null, id, aAnular.id)}
              campos={[]}
              elegibles={{}}
              inicial={{ escrito: {}, errores: {} }}
              enviar={{ texto: "Confirmar anulación", variante: "peligro" }}
              rutaAlCancelar={rutaDelEgreso}
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
    <Marco email={email} rol={rol} rutaActual="/egresos">
      <main>{contenido}</main>
    </Marco>
  );
}
