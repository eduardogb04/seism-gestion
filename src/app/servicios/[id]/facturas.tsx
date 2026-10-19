/**
 * La sección *Facturas* de la pantalla de un servicio (F2-06, ADR 0036): la
 * tabla, con la más nueva arriba, y la carga (`?factura=1`) y la anulación
 * (`?anularFactura=<id>`) como ventanas sobre esta misma pantalla. Se carga el
 * importe sin IVA; el IVA y el total salen calculados, en el listado y al lado
 * de los campos mientras se escribe. Cada fila trae lo cobrado, lo retenido y el
 * saldo (F2-07, ADR 0037), y desde ahí se cobra.
 */

import { ACEPTA } from "../../../casos-uso/documentos/documentos.ts";
import type { FacturaListada } from "../../../casos-uso/servicios/facturas.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { EnlaceDeDescarga } from "../../_ui/enlace-de-descarga.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import {
  anularFactura,
  cargarFactura,
  guardarCambioDeFactura,
} from "../acciones.ts";
import {
  CambioDelComprobante,
  textoDelEnlaceDeCambio,
  VentanaDelCambio,
} from "./cambio-del-comprobante.tsx";
import { Cobros } from "./cobros.tsx";
import { IvaEnVivo } from "./iva-en-vivo.tsx";

const CABECERAS = [
  "Número",
  "Fecha",
  "Vencimiento",
  "Orden de compra",
  "Importe sin IVA",
  "Alícuota",
  "IVA",
  "Total con IVA",
  "Cobrado",
  "Retenido",
  "Saldo",
  "Estado",
  "Documento",
  "Cargada por",
  "Tipo de cambio",
  "Período",
];

async function VentanaDeCarga({
  servicioId,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly rutaAlCerrar: string;
}) {
  const { campos, escrito } = await armado().facturas.formulario(servicioId);
  return (
    <Ventana titulo="Nueva factura" rutaAlCerrar={rutaAlCerrar}>
      <FormularioAbm
        accion={cargarFactura.bind(null, servicioId)}
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
      >
        <IvaEnVivo />
      </FormularioAbm>
    </Ventana>
  );
}

function VentanaDeAnulacion({
  servicioId,
  factura,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly factura: FacturaListada | undefined;
  readonly rutaAlCerrar: string;
}) {
  return (
    <Ventana titulo="Anular factura" rutaAlCerrar={rutaAlCerrar}>
      {factura === undefined ? (
        <ErrorEnPantalla error={pantallaDeCodigo("DOM-0009")} />
      ) : (
        <>
          <p className="mb-4">
            Confirmá que anulás la factura {factura.numero}. Su número queda
            libre.
          </p>
          <FormularioAbm
            accion={anularFactura.bind(null, servicioId, factura.id)}
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

export async function Facturas({
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
  const facturas = await armado().facturas.listar(servicioId);
  const cobranza = await armado().cobros.cobranza(servicioId);
  const aAnular = parametros.anularFactura;
  const aCambiar = parametros.cambioFactura;
  const facturaACambiar = facturas.find(({ id }) => id === aCambiar);
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Facturas</h2>
      {puedeEscribir ? (
        <p className="mb-3">
          <Enlace
            href={`${ruta}?factura=1`}
            scroll={false}
            className={clasesDeBoton("primario")}
          >
            Nueva factura
          </Enlace>
        </p>
      ) : null}
      {facturas.length === 0 ? (
        <p>Todavía no hay facturas cargadas.</p>
      ) : (
        <Tabla
          cabeceras={puedeEscribir ? [...CABECERAS, "Acciones"] : CABECERAS}
        >
          {facturas.map((factura) => {
            const cobro = cobranza.find(
              ({ facturaId }) => facturaId === factura.id,
            );
            return (
              <tr key={factura.id}>
                <td>{factura.numero}</td>
                <td>{factura.fecha}</td>
                <td>{factura.vencimiento}</td>
                <td>{factura.ordenCompra}</td>
                <td>{factura.sinIva}</td>
                <td>{factura.alicuota}</td>
                <td>{factura.iva}</td>
                <td>{factura.total}</td>
                <td>{cobro?.cobrado}</td>
                <td>{cobro?.retenido}</td>
                <td>{cobro?.saldo}</td>
                <td>
                  {cobro?.cobrada ? <strong>Cobrada</strong> : "Con saldo"}
                </td>
                <td>
                  {factura.documento === null ? (
                    "—"
                  ) : (
                    <EnlaceDeDescarga {...factura.documento} />
                  )}
                </td>
                <td>{factura.quien}</td>
                <td>
                  <CambioDelComprobante cambio={factura.cambio} />
                </td>
                <td>{factura.periodo}</td>
                {puedeEscribir ? (
                  <td>
                    <div className="flex gap-3">
                      {cobro?.cobrada ? null : (
                        <Enlace
                          href={`${ruta}?cobrar=${factura.id}`}
                          scroll={false}
                        >
                          Cobrar
                        </Enlace>
                      )}
                      {textoDelEnlaceDeCambio(factura.cambio) ===
                      null ? null : (
                        <Enlace
                          href={`${ruta}?cambioFactura=${factura.id}`}
                          scroll={false}
                        >
                          {textoDelEnlaceDeCambio(factura.cambio)}
                        </Enlace>
                      )}
                      <Enlace
                        href={`${ruta}?anularFactura=${factura.id}`}
                        scroll={false}
                      >
                        Anular
                      </Enlace>
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </Tabla>
      )}
      <Cobros
        servicioId={servicioId}
        ruta={ruta}
        puedeEscribir={puedeEscribir}
        parametros={parametros}
        facturas={facturas}
        cobranza={cobranza}
      />
      {puedeEscribir && typeof parametros.factura === "string" ? (
        <VentanaDeCarga servicioId={servicioId} rutaAlCerrar={ruta} />
      ) : null}
      {puedeEscribir && typeof aCambiar === "string" ? (
        <VentanaDelCambio
          que={`la factura ${facturaACambiar?.numero ?? ""}`}
          formulario={
            facturaACambiar === undefined
              ? undefined
              : await armado().facturas.formularioDeCambio(facturaACambiar.id)
          }
          accion={guardarCambioDeFactura.bind(null, servicioId, aCambiar)}
          rutaAlCerrar={ruta}
        />
      ) : null}
      {puedeEscribir && typeof aAnular === "string" ? (
        <VentanaDeAnulacion
          servicioId={servicioId}
          factura={facturas.find(({ id }) => id === aAnular)}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </section>
  );
}
