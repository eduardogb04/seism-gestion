/**
 * La pantalla de una factura (F3-07): sus datos y su trazabilidad —el
 * documento, los cobros con su saldo y los cambios del tipo de cambio— y el
 * botón «Registrar cobro», que abre la misma ventana que los listados
 * (`?cobrar=<id>`). HTML del servidor: funciona sin JavaScript.
 */

import type { ReactNode } from "react";
import { ROLES_QUE_ESCRIBEN_SERVICIOS } from "../../../../casos-uso/servicios/servicios.ts";
import {
  codigoDeError,
  pantallaDeCodigo,
} from "../../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../../_ui/boton.tsx";
import { Cambios } from "../../../_ui/cambios.tsx";
import { EnlaceDeDescarga } from "../../../_ui/enlace-de-descarga.tsx";
import { Enlace } from "../../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../../_ui/error-en-pantalla.tsx";
import { Marco } from "../../../_ui/marco.tsx";
import { VentanaDeCobro } from "../../../_ui/ventana-de-movimiento.tsx";
import { sesionExigida } from "../../../(auth)/sesion-actual.ts";
import { CambioDelComprobante } from "../../[id]/cambio-del-comprobante.tsx";
import { TablaDeCobros } from "../../[id]/cobros.tsx";

type Props = {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DetalleDeFactura({
  params,
  searchParams,
}: Props) {
  const sesion = await sesionExigida();
  const { id } = await params;
  const parametros = await searchParams;
  const { email, rol } = sesion.usuario;
  const ruta = `/servicios/facturas/${id}`;
  const puedeEscribir = ROLES_QUE_ESCRIBEN_SERVICIOS.includes(rol);
  const cobrar = typeof parametros.cobrar === "string";

  let contenido: ReactNode;
  try {
    const factura = await armado().facturas.ver(id);
    const cobranza = (await armado().cobros.cobranza(factura.servicioId)).find(
      ({ facturaId }) => facturaId === id,
    );
    contenido = (
      <>
        <h1>Factura {factura.numero}</h1>
        <dl className="my-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="font-medium">Servicio</dt>
          <dd>
            <a href={`/servicios/${factura.servicioId}`}>{factura.servicio}</a>
          </dd>
          <dt className="font-medium">Orden de compra</dt>
          <dd>{factura.ordenCompra === "" ? "—" : factura.ordenCompra}</dd>
          <dt className="font-medium">Fecha</dt>
          <dd>{factura.fecha}</dd>
          <dt className="font-medium">Vencimiento</dt>
          <dd>{factura.vencimiento}</dd>
          <dt className="font-medium">Importe sin IVA</dt>
          <dd>{factura.sinIva}</dd>
          <dt className="font-medium">IVA ({factura.alicuota})</dt>
          <dd>{factura.iva}</dd>
          <dt className="font-medium">Total con IVA</dt>
          <dd>{factura.total}</dd>
          {factura.cambio === null ? null : (
            <>
              <dt className="font-medium">Tipo de cambio</dt>
              <dd>
                <CambioDelComprobante cambio={factura.cambio} />
              </dd>
            </>
          )}
          <dt className="font-medium">Documento</dt>
          <dd>
            {factura.documento === null ? (
              "—"
            ) : (
              <EnlaceDeDescarga {...factura.documento} />
            )}
          </dd>
          <dt className="font-medium">Cargó</dt>
          <dd>{factura.quien}</dd>
        </dl>
        {cobranza === undefined ? null : (
          <p className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-lg">
            <span>
              Cobrado: <strong data-cobrado>{cobranza.cobrado}</strong>
            </span>
            <span>
              Retenido: <strong>{cobranza.retenido}</strong>
            </span>
            <span>
              Saldo: <strong data-saldo>{cobranza.saldo}</strong>
            </span>
            {cobranza.cobrada ? (
              <strong data-estado-cobrada className="text-exito">
                Cobrada
              </strong>
            ) : null}
          </p>
        )}
        {puedeEscribir && cobranza?.cobrada === false ? (
          <p className="mb-4">
            <Enlace
              href={`${ruta}?cobrar=${id}`}
              scroll={false}
              className={clasesDeBoton("primario")}
            >
              Registrar cobro
            </Enlace>
          </p>
        ) : null}
        <h2 className="mb-2 text-xl font-semibold">Cobros</h2>
        {cobranza === undefined || cobranza.cobros.length === 0 ? (
          <p>Todavía no tiene cobros.</p>
        ) : (
          <TablaDeCobros cobros={cobranza.cobros} rutaParaAnular={null} />
        )}
        <Cambios cambios={factura.cambios} />
        {puedeEscribir && cobrar ? (
          <VentanaDeCobro facturaId={id} rutaAlCerrar={ruta} />
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
    <Marco email={email} rol={rol} rutaActual="/servicios/facturas">
      <main>{contenido}</main>
    </Marco>
  );
}
