/**
 * La sección *Órdenes de compra* de la pantalla de un servicio (F2-06, ADR
 * 0036): la tabla, con la más nueva arriba y su saldo por facturar (sin IVA), y
 * la anulación (`?anularOrden=<id>`) como ventana sobre esta misma pantalla.
 * La carga (`?orden=1`) la ofrece el panel de «Cotizado» (F6-01).
 */

import { Trash2 } from "lucide-react";
import { ACEPTA } from "../../../casos-uso/documentos/documentos.ts";
import type {
  AmpliacionListada,
  OrdenListada,
} from "../../../casos-uso/servicios/ordenes-de-compra.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { IconoDeDocumento } from "../../_ui/icono-de-documento.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { Importe } from "../_listado/piezas.tsx";
import {
  ampliarOrdenDeCompra,
  anularAmpliacionDeOrden,
  anularOrdenDeCompra,
  cargarOrdenDeCompra,
  guardarCambioDeOrdenDeCompra,
  reemplazarOrdenDeCompra,
} from "../acciones.ts";
import { Parte } from "./_molde/parte.tsx";
import {
  CambioDelComprobante,
  textoDelEnlaceDeCambio,
  VentanaDelCambio,
} from "./cambio-del-comprobante.tsx";

export async function VentanaDeCarga({
  servicioId,
  rutaAlCerrar,
  reemplaza = false,
  anterior,
}: {
  readonly servicioId: string;
  readonly rutaAlCerrar: string;
  /** Carga una orden que reemplaza a la vigente (`anterior`). */
  readonly reemplaza?: boolean;
  readonly anterior?: string;
}) {
  const { campos, escrito } =
    await armado().ordenesDeCompra.formulario(servicioId);
  return (
    <Ventana
      titulo={
        reemplaza ? "Reemplazar orden de compra" : "Nueva orden de compra"
      }
      rutaAlCerrar={rutaAlCerrar}
    >
      {reemplaza ? (
        <p className="mb-4 text-[13px] text-texto-2">
          La orden N° {anterior} queda en la historia con sus facturas.
        </p>
      ) : null}
      <FormularioAbm
        accion={(reemplaza
          ? reemplazarOrdenDeCompra
          : cargarOrdenDeCompra
        ).bind(null, servicioId)}
        campos={campos}
        elegibles={{}}
        inicial={{ escrito, errores: {} }}
        archivo={{
          nombre: "archivo",
          etiqueta: "Documento (opcional)",
          accept: ACEPTA,
        }}
        enviar={{ texto: "Cargar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

function VentanaDeAnulacion({
  servicioId,
  orden,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly orden: OrdenListada | undefined;
  readonly rutaAlCerrar: string;
}) {
  return (
    <Ventana
      titulo={
        orden === undefined
          ? "Anular orden de compra"
          : `¿Anular la orden de compra ${orden.numero}?`
      }
      rutaAlCerrar={rutaAlCerrar}
    >
      {orden === undefined ? (
        <ErrorEnPantalla error={pantallaDeCodigo("DOM-0009")} />
      ) : (
        <>
          <p className="mb-4">
            Confirmá que anulás la orden de compra {orden.numero}. Una orden con
            facturas vigentes no se anula: primero se anulan sus facturas.
          </p>
          <FormularioAbm
            accion={anularOrdenDeCompra.bind(null, servicioId, orden.id)}
            campos={[]}
            elegibles={{}}
            inicial={{ escrito: {}, errores: {} }}
            enviar={{ texto: "Confirmar anulación", variante: "peligro" }}
            rutaAlCancelar={rutaAlCerrar}
          />
        </>
      )}
    </Ventana>
  );
}

async function VentanaDeAmpliacion({
  servicioId,
  orden,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly orden: OrdenListada;
  readonly rutaAlCerrar: string;
}) {
  const { campos, escrito } =
    await armado().ordenesDeCompra.formularioDeAmpliacion(orden.id);
  return (
    <Ventana
      titulo={`Ampliar la orden de compra ${orden.numero}`}
      rutaAlCerrar={rutaAlCerrar}
    >
      <FormularioAbm
        accion={ampliarOrdenDeCompra.bind(null, servicioId, orden.id)}
        campos={campos}
        elegibles={{}}
        inicial={{ escrito, errores: {} }}
        archivo={{
          nombre: "archivo",
          etiqueta: "Documento (opcional)",
          accept: ACEPTA,
        }}
        enviar={{ texto: "Ampliar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

function VentanaDeAnulacionDeAmpliacion({
  servicioId,
  ampliacion,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly ampliacion: AmpliacionListada | undefined;
  readonly rutaAlCerrar: string;
}) {
  return (
    <Ventana
      titulo={
        ampliacion === undefined
          ? "Anular ampliación"
          : `¿Anular la ampliación ${ampliacion.numero}?`
      }
      rutaAlCerrar={rutaAlCerrar}
    >
      {ampliacion === undefined ? (
        <ErrorEnPantalla error={pantallaDeCodigo("DOM-0009")} />
      ) : (
        <>
          <p className="mb-4">
            El total de la orden baja {ampliacion.importe}. Si la ampliación
            movió la fecha de fin del servicio, esa fecha no se revierte.
          </p>
          <FormularioAbm
            accion={anularAmpliacionDeOrden.bind(
              null,
              servicioId,
              ampliacion.id,
            )}
            campos={[]}
            elegibles={{}}
            inicial={{ escrito: {}, errores: {} }}
            enviar={{ texto: "Anular ampliación", variante: "peligro" }}
            rutaAlCancelar={rutaAlCerrar}
          />
        </>
      )}
    </Ventana>
  );
}

function FilaDeOrden({
  orden,
  ruta,
  puedeEscribir,
  vigente,
}: {
  readonly orden: OrdenListada;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly vigente: boolean;
}) {
  const acciones = puedeEscribir && vigente;
  return (
    <li className="rounded-lg border border-borde bg-superficie px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <span className="flex min-w-0 flex-col">
          <span className="font-mono text-[13px] font-medium whitespace-nowrap">
            {orden.numero}
          </span>
          <span className="text-[12px] text-texto-3">
            <span className="cifras">{orden.fecha}</span>
            {orden.reemplazadaEl === null
              ? ` · cargó ${orden.quien}`
              : ` · reemplazada el ${orden.reemplazadaEl.slice(0, 5)}`}
          </span>
        </span>
        <span className="cifras flex flex-wrap items-baseline justify-end gap-x-4 text-[13px] whitespace-nowrap">
          <span>
            <span className="text-[12px] text-texto-3">Total </span>
            <Importe texto={orden.total} />
          </span>
          <span>
            <span className="text-[12px] text-texto-3">Facturado </span>
            {orden.facturado}
          </span>
          <span>
            <span className="text-[12px] text-texto-3">Saldo </span>
            <Importe texto={orden.saldo} />
          </span>
        </span>
        <span className="flex items-center gap-1">
          <IconoDeDocumento id={orden.documento?.id} />
          {acciones && textoDelEnlaceDeCambio(orden.cambio) !== null ? (
            <Enlace href={`${ruta}?cambioOrden=${orden.id}`} scroll={false}>
              {textoDelEnlaceDeCambio(orden.cambio)}
            </Enlace>
          ) : null}
          {acciones ? (
            <Enlace
              href={`${ruta}?anularOrden=${orden.id}`}
              scroll={false}
              data-carga="anulacionDeOrdenDeCompra"
              className={clasesDeBoton(
                "fantasma",
                "h-8 px-2.5 text-[13px] text-peligro hover:text-peligro",
              )}
            >
              Anular
            </Enlace>
          ) : null}
        </span>
      </div>
      {orden.ampliaciones.length > 0 ? (
        <p className="m-0 mt-0.5 text-[12px] text-texto-3">
          original <span className="cifras">{orden.importeOriginal}</span>
        </p>
      ) : null}
      {orden.aviso === null ? null : (
        <p
          role="status"
          className="m-0 mt-1 text-[13px] font-medium text-aviso"
        >
          {orden.aviso}
        </p>
      )}
      {orden.otraMoneda.length === 0 ? null : (
        <p className="m-0 mt-1 text-[12px] text-texto-3">
          Facturas en otra moneda (no suman): {orden.otraMoneda.join("; ")}
        </p>
      )}
      <CambioDelComprobante cambio={orden.cambio} />
      {orden.ampliaciones.length === 0 ? null : (
        <ul className="m-0 mt-2 flex list-none flex-col gap-1 border-t border-borde p-0 pt-2">
          {orden.ampliaciones.map((ampliacion) => (
            <li
              key={ampliacion.id}
              className="flex flex-wrap items-center justify-between gap-x-3 text-[13px]"
            >
              <span className="min-w-0">
                <span className="font-mono">{ampliacion.numero}</span>
                <span className="text-texto-3">
                  {" · "}
                  <span className="cifras">{ampliacion.fecha}</span>
                  {ampliacion.nuevaFechaFin === null
                    ? ""
                    : ` · hasta ${ampliacion.nuevaFechaFin}`}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <span className="cifras whitespace-nowrap">
                  + {ampliacion.importe}
                </span>
                <IconoDeDocumento id={ampliacion.documento?.id} />
                {acciones ? (
                  <Enlace
                    href={`${ruta}?anularAmpliacion=${ampliacion.id}`}
                    scroll={false}
                    aria-label={`Anular la ampliación ${ampliacion.numero}`}
                    title="Anular ampliación"
                    className="presionable inline-grid size-8 place-items-center rounded-md text-texto-2 hover:bg-superficie-3 hover:text-peligro"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Enlace>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export async function OrdenesDeCompra({
  enSeccion,
  servicioId,
  ruta,
  puedeEscribir,
  parametros,
}: {
  /** Dentro de una `Seccion` del molde: sin título propio. */
  readonly enSeccion?: boolean;
  readonly servicioId: string;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const ordenes = await armado().ordenesDeCompra.listar(servicioId);
  const vigente = ordenes.find(({ reemplazadaEl }) => reemplazadaEl === null);
  const anteriores = ordenes.filter(
    ({ reemplazadaEl }) => reemplazadaEl !== null,
  );
  const aAnular = parametros.anularOrden;
  const aCambiar = parametros.cambioOrden;
  const ordenACambiar = ordenes.find(({ id }) => id === aCambiar);
  const aAnularAmpliacion = parametros.anularAmpliacion;
  const botones = clasesDeBoton("secundario", "h-8 px-2.5 text-[13px]");
  return (
    <Parte enSeccion={enSeccion} titulo="Órdenes de compra">
      {vigente === undefined ? (
        <p>Todavía no hay órdenes de compra cargadas.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          <FilaDeOrden
            orden={vigente}
            ruta={ruta}
            puedeEscribir={puedeEscribir}
            vigente
          />
        </ul>
      )}
      {puedeEscribir && vigente !== undefined ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Enlace
            href={`${ruta}?ampliar=1`}
            scroll={false}
            className={botones}
            data-carga="ampliacionDeOrden"
          >
            Ampliar OC
          </Enlace>
          <Enlace
            href={`${ruta}?reemplazar=1`}
            scroll={false}
            className={botones}
            data-carga="reemplazoDeOrden"
          >
            Reemplazar OC
          </Enlace>
        </div>
      ) : null}
      {anteriores.length === 0 ? null : (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] text-texto-2">
            Órdenes anteriores ({anteriores.length})
          </summary>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {anteriores.map((orden) => (
              <FilaDeOrden
                key={orden.id}
                orden={orden}
                ruta={ruta}
                puedeEscribir={puedeEscribir}
                vigente={false}
              />
            ))}
          </ul>
        </details>
      )}
      {puedeEscribir &&
      vigente !== undefined &&
      typeof parametros.ampliar === "string" ? (
        <VentanaDeAmpliacion
          servicioId={servicioId}
          orden={vigente}
          rutaAlCerrar={ruta}
        />
      ) : null}
      {puedeEscribir &&
      vigente !== undefined &&
      typeof parametros.reemplazar === "string" ? (
        <VentanaDeCarga
          servicioId={servicioId}
          rutaAlCerrar={ruta}
          reemplaza
          anterior={vigente.numero}
        />
      ) : null}
      {puedeEscribir && typeof aAnularAmpliacion === "string" ? (
        <VentanaDeAnulacionDeAmpliacion
          servicioId={servicioId}
          ampliacion={ordenes
            .flatMap(({ ampliaciones }) => ampliaciones)
            .find(({ id }) => id === aAnularAmpliacion)}
          rutaAlCerrar={ruta}
        />
      ) : null}
      {puedeEscribir && typeof aCambiar === "string" ? (
        <VentanaDelCambio
          que={`la orden de compra ${ordenACambiar?.numero ?? ""}`}
          formulario={
            ordenACambiar === undefined
              ? undefined
              : await armado().ordenesDeCompra.formularioDeCambio(
                  ordenACambiar.id,
                )
          }
          accion={guardarCambioDeOrdenDeCompra.bind(null, servicioId, aCambiar)}
          rutaAlCerrar={ruta}
        />
      ) : null}
      {puedeEscribir && typeof aAnular === "string" ? (
        <VentanaDeAnulacion
          servicioId={servicioId}
          orden={ordenes.find(({ id }) => id === aAnular)}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </Parte>
  );
}
