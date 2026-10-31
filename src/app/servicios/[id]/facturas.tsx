/**
 * La sección *Facturas* de la pantalla de un servicio (F2-06, ADR 0036): la
 * tabla, con la más nueva arriba, y la carga (`?factura=1`) y la anulación
 * (`?anularFactura=<id>`) como ventanas sobre esta misma pantalla. Se carga el
 * importe sin IVA; el IVA y el total salen calculados, en el listado y al lado
 * de los campos mientras se escribe. Cada fila trae lo cobrado, lo retenido y el
 * saldo (F2-07, ADR 0037), y desde ahí se cobra. Cargar la factura es una
 * acción del panel; acá solo se abre su ventana (`?factura=1`). El resto de
 * cada comprobante se ve en su pantalla, a la que lleva el número.
 */

import { ACEPTA } from "../../../casos-uso/documentos/documentos.ts";
import type { FacturaListada } from "../../../casos-uso/servicios/facturas.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../_ui/boton.tsx";
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
  textoDelEnlaceDeCambio,
  VentanaDelCambio,
} from "./cambio-del-comprobante.tsx";
import { Cobros } from "./cobros.tsx";
import { IvaEnVivo } from "./iva-en-vivo.tsx";

const CABECERAS = ["Número", "Vencimiento", "Total con IVA", "Saldo"];

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
  puedeFacturar,
  puedeCobrar,
  parametros,
  sinFilasNoSeDibuja,
}: {
  readonly servicioId: string;
  readonly ruta: string;
  /** Anular o cambiar una factura y abrir la ventana de la nueva: la etapa admite la carga `factura`. */
  readonly puedeFacturar: boolean;
  /** Cobrar y anular un cobro: la etapa admite la carga `cobro`. */
  readonly puedeCobrar: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
  /** La etapa no ofrece cargar facturas: sin ninguna, la sección no se dibuja. */
  readonly sinFilasNoSeDibuja: boolean;
}) {
  const facturas = await armado().facturas.listar(servicioId);
  if (sinFilasNoSeDibuja && facturas.length === 0) {
    return null;
  }
  const cobranza = await armado().cobros.cobranza(servicioId);
  const aAnular = parametros.anularFactura;
  const aCambiar = parametros.cambioFactura;
  const facturaACambiar = facturas.find(({ id }) => id === aCambiar);
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Facturas</h2>
      {facturas.length === 0 ? (
        <p>Todavía no hay facturas cargadas.</p>
      ) : (
        <Tabla
          cabeceras={
            puedeFacturar || puedeCobrar
              ? [...CABECERAS, "Acciones"]
              : CABECERAS
          }
        >
          {facturas.map((factura) => {
            const cobro = cobranza.find(
              ({ facturaId }) => facturaId === factura.id,
            );
            return (
              <tr key={factura.id}>
                <td>
                  <Enlace href={`/servicios/facturas/${factura.id}`}>
                    {factura.numero}
                  </Enlace>
                </td>
                <td>{factura.vencimiento}</td>
                <td>{factura.total}</td>
                <td>{cobro?.saldo}</td>
                {puedeFacturar || puedeCobrar ? (
                  <td>
                    <div className="flex flex-wrap items-center gap-3">
                      {puedeCobrar && !cobro?.cobrada ? (
                        <Enlace
                          href={`${ruta}?cobrar=${factura.id}`}
                          scroll={false}
                          className={clasesDeBoton("primario")}
                          data-carga="cobro"
                        >
                          Registrar cobro
                        </Enlace>
                      ) : null}
                      {puedeFacturar &&
                      textoDelEnlaceDeCambio(factura.cambio) !== null ? (
                        <Enlace
                          href={`${ruta}?cambioFactura=${factura.id}`}
                          scroll={false}
                          data-carga="factura"
                        >
                          {textoDelEnlaceDeCambio(factura.cambio)}
                        </Enlace>
                      ) : null}
                      {puedeFacturar ? (
                        <Enlace
                          href={`${ruta}?anularFactura=${factura.id}`}
                          scroll={false}
                          data-carga="factura"
                        >
                          Anular
                        </Enlace>
                      ) : null}
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
        puedeEscribir={puedeCobrar}
        parametros={parametros}
        facturas={facturas}
        cobranza={cobranza}
      />
      {puedeFacturar && typeof parametros.factura === "string" ? (
        <VentanaDeCarga servicioId={servicioId} rutaAlCerrar={ruta} />
      ) : null}
      {puedeFacturar && typeof aCambiar === "string" ? (
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
      {puedeFacturar && typeof aAnular === "string" ? (
        <VentanaDeAnulacion
          servicioId={servicioId}
          factura={facturas.find(({ id }) => id === aAnular)}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </section>
  );
}
