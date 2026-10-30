/**
 * La sección *Órdenes de compra* de la pantalla de un servicio (F2-06, ADR
 * 0036): la tabla, con la más nueva arriba y su saldo por facturar (sin IVA), y
 * la anulación (`?anularOrden=<id>`) como ventana sobre esta misma pantalla.
 * La carga (`?orden=1`) la ofrece el panel de «Cotizado» (F6-01).
 */

import { ACEPTA } from "../../../casos-uso/documentos/documentos.ts";
import type { OrdenListada } from "../../../casos-uso/servicios/ordenes-de-compra.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { EnlaceDeDescarga } from "../../_ui/enlace-de-descarga.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import {
  anularOrdenDeCompra,
  cargarOrdenDeCompra,
  guardarCambioDeOrdenDeCompra,
} from "../acciones.ts";
import { LineasDeAvance } from "./avance.tsx";
import {
  CambioDelComprobante,
  textoDelEnlaceDeCambio,
  VentanaDelCambio,
} from "./cambio-del-comprobante.tsx";

const CABECERAS = [
  "Número",
  "Fecha",
  "Total sin IVA",
  "Facturado",
  "Saldo por facturar",
  "Avance",
  "Documento",
  "Cargada por",
  "Tipo de cambio",
];

export async function VentanaDeCarga({
  servicioId,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly rutaAlCerrar: string;
}) {
  const { campos, escrito } =
    await armado().ordenesDeCompra.formulario(servicioId);
  return (
    <Ventana titulo="Nueva orden de compra" rutaAlCerrar={rutaAlCerrar}>
      <FormularioAbm
        accion={cargarOrdenDeCompra.bind(null, servicioId)}
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
    <Ventana titulo="Anular orden de compra" rutaAlCerrar={rutaAlCerrar}>
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

export async function OrdenesDeCompra({
  servicioId,
  ruta,
  puedeEscribir,
  parametros,
}: {
  readonly servicioId: string;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const ordenes = await armado().ordenesDeCompra.listar(servicioId);
  const { ordenes: avance } = await armado().cobros.avance(servicioId);
  const aAnular = parametros.anularOrden;
  const aCambiar = parametros.cambioOrden;
  const ordenACambiar = ordenes.find(({ id }) => id === aCambiar);
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Órdenes de compra</h2>
      {ordenes.length === 0 ? (
        <p>Todavía no hay órdenes de compra cargadas.</p>
      ) : (
        <Tabla
          cabeceras={puedeEscribir ? [...CABECERAS, "Acciones"] : CABECERAS}
        >
          {ordenes.map((orden) => (
            <tr key={orden.id}>
              <td>{orden.numero}</td>
              <td>{orden.fecha}</td>
              <td>{orden.total}</td>
              <td>
                {orden.facturado}
                {orden.otraMoneda.length === 0 ? null : (
                  <p className="text-sm text-texto-suave">
                    Facturas en otra moneda (no suman):{" "}
                    {orden.otraMoneda.join("; ")}
                  </p>
                )}
              </td>
              <td>
                {orden.saldo}
                {orden.aviso === null ? null : (
                  <p role="status" className="text-sm font-medium text-aviso">
                    {orden.aviso}
                  </p>
                )}
              </td>
              <td>
                <LineasDeAvance lineas={avance[orden.id] ?? []} />
              </td>
              <td>
                {orden.documento === null ? (
                  "—"
                ) : (
                  <EnlaceDeDescarga {...orden.documento} />
                )}
              </td>
              <td>{orden.quien}</td>
              <td>
                <CambioDelComprobante cambio={orden.cambio} />
              </td>
              {puedeEscribir ? (
                <td>
                  <div className="flex gap-3">
                    {textoDelEnlaceDeCambio(orden.cambio) === null ? null : (
                      <Enlace
                        href={`${ruta}?cambioOrden=${orden.id}`}
                        scroll={false}
                      >
                        {textoDelEnlaceDeCambio(orden.cambio)}
                      </Enlace>
                    )}
                    <Enlace
                      href={`${ruta}?anularOrden=${orden.id}`}
                      scroll={false}
                      data-carga="anulacionDeOrdenDeCompra"
                    >
                      Anular
                    </Enlace>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </Tabla>
      )}
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
    </section>
  );
}
