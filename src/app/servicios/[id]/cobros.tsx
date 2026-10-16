/**
 * Los cobros de las facturas de un servicio (F2-07, ADR 0037): por cada factura
 * con cobros, su tabla; y cobrar (`?cobrar=<factura>`) y anular un cobro
 * (`?anularCobro=<id>`) como ventanas sobre la pantalla del servicio.
 */

import { ACEPTA } from "../../../casos-uso/documentos/documentos.ts";
import type {
  CobranzaDeFactura,
  CobroVisible,
} from "../../../casos-uso/servicios/cobros.ts";
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
import { anularCobro, cobrarFactura } from "../acciones.ts";

const CABECERAS = [
  "Fecha del cobro",
  "Días desde la factura",
  "Importe cobrado",
  "Retención",
  "Cuenta",
  "Entró a la cuenta",
  "Tipo de cambio",
  "Orden de pago",
  "Observaciones",
  "Cargó",
];

async function VentanaDeCobro({
  servicioId,
  factura,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly factura: FacturaListada | undefined;
  readonly rutaAlCerrar: string;
}) {
  if (factura === undefined) {
    return (
      <Ventana titulo="Cobrar factura" rutaAlCerrar={rutaAlCerrar}>
        <ErrorEnPantalla error={pantallaDeCodigo("DOM-0009")} />
      </Ventana>
    );
  }
  const { numero, saldo, campos, elegibles, escrito } =
    await armado().cobros.formulario(factura.id);
  return (
    <Ventana titulo="Cobrar factura" rutaAlCerrar={rutaAlCerrar}>
      <p className="mb-4">
        Factura {numero}: falta cobrar {saldo}.
      </p>
      <FormularioAbm
        accion={cobrarFactura.bind(null, servicioId, factura.id)}
        campos={campos}
        elegibles={elegibles}
        inicial={{ escrito, errores: {} }}
        archivo={{
          nombre: "archivo",
          etiqueta: "Documento de la orden de pago (opcional)",
          accept: ACEPTA,
        }}
        enviar={{ texto: "Cobrar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

function VentanaDeAnulacion({
  servicioId,
  cobro,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly cobro: CobroVisible | undefined;
  readonly rutaAlCerrar: string;
}) {
  return (
    <Ventana titulo="Anular cobro" rutaAlCerrar={rutaAlCerrar}>
      {cobro === undefined ? (
        <ErrorEnPantalla error={pantallaDeCodigo("DOM-0009")} />
      ) : (
        <>
          <p className="mb-4">
            Confirmá que anulás el cobro del {cobro.fecha} por {cobro.importe}:
            el saldo de la factura vuelve.
          </p>
          <FormularioAbm
            accion={anularCobro.bind(null, servicioId, cobro.id)}
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

export function Cobros({
  servicioId,
  ruta,
  puedeEscribir,
  parametros,
  facturas,
  cobranza,
}: {
  readonly servicioId: string;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
  readonly facturas: readonly FacturaListada[];
  readonly cobranza: readonly CobranzaDeFactura[];
}) {
  const aCobrar = parametros.cobrar;
  const aAnular = parametros.anularCobro;
  return (
    <>
      {facturas.map((factura) => {
        const cobros =
          cobranza.find(({ facturaId }) => facturaId === factura.id)?.cobros ??
          [];
        return cobros.length === 0 ? null : (
          <div key={factura.id} className="mt-4">
            <h3 className="mb-2 text-lg font-semibold">
              Cobros de la factura {factura.numero}
            </h3>
            <Tabla
              cabeceras={puedeEscribir ? [...CABECERAS, "Acciones"] : CABECERAS}
            >
              {cobros.map((cobro) => (
                <tr key={cobro.id}>
                  <td>{cobro.fecha}</td>
                  <td>{cobro.dias}</td>
                  <td>{cobro.importe}</td>
                  <td>{cobro.retencion}</td>
                  <td>{cobro.cuenta}</td>
                  <td>{cobro.entrada}</td>
                  <td>{cobro.cambio}</td>
                  <td>
                    {cobro.ordenPagoNumero}
                    {cobro.ordenPagoDocumento === null ? null : (
                      <p>
                        <EnlaceDeDescarga {...cobro.ordenPagoDocumento} />
                      </p>
                    )}
                  </td>
                  <td className="whitespace-pre-line">{cobro.observaciones}</td>
                  <td>{cobro.quien}</td>
                  {puedeEscribir ? (
                    <td>
                      <Enlace
                        href={`${ruta}?anularCobro=${cobro.id}`}
                        scroll={false}
                        className={clasesDeBoton("peligro")}
                      >
                        Anular cobro
                      </Enlace>
                    </td>
                  ) : null}
                </tr>
              ))}
            </Tabla>
          </div>
        );
      })}
      {puedeEscribir && typeof aCobrar === "string" ? (
        <VentanaDeCobro
          servicioId={servicioId}
          factura={facturas.find(({ id }) => id === aCobrar)}
          rutaAlCerrar={ruta}
        />
      ) : null}
      {puedeEscribir && typeof aAnular === "string" ? (
        <VentanaDeAnulacion
          servicioId={servicioId}
          cobro={cobranza
            .flatMap(({ cobros }) => cobros)
            .find(({ id }) => id === aAnular)}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </>
  );
}
