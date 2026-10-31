/**
 * Lo de *Facturación* que muestran los paneles (F3-03, ADR 0041): el historial
 * de la cuota mensual y, por moneda y al mes del reloj, lo devengado, lo que
 * falta facturar, el saldo de la orden de compra, lo facturado, lo cobrado y lo
 * que falta cobrar. Ajustar la cuota (`?ajusteDeCuota=1`, con su aviso antes de
 * confirmar) es una ventana sobre el panel.
 */

import type { LineaDeAvance } from "../../../casos-uso/servicios/cobros.ts";
import type {
  CasosUsoFacturacion,
  Facturacion as DatosDeFacturacion,
} from "../../../casos-uso/servicios/facturacion.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { GrillaDeMetricas } from "../../_ui/panel.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { TarjetaKpi } from "../../_ui/tarjeta-kpi.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { ajustarCuota } from "../acciones.ts";
import { AvisoDeAjuste } from "./aviso-de-ajuste.tsx";
import { metricasDeCobro } from "./datos-de-panel.ts";

/** Sin `armado()`: la sección le pasa el formulario y un test la dibuja con el aviso. */
export function VentanaDeAjuste({
  servicioId,
  rutaAlCerrar,
  formulario: { campos, escrito },
}: {
  readonly servicioId: string;
  readonly rutaAlCerrar: string;
  readonly formulario: Awaited<
    ReturnType<CasosUsoFacturacion["formularioDeAjuste"]>
  >;
}) {
  return (
    <Ventana titulo="Ajustar la cuota" rutaAlCerrar={rutaAlCerrar}>
      <FormularioAbm
        accion={ajustarCuota.bind(null, servicioId)}
        campos={campos}
        elegibles={{}}
        inicial={{ escrito, errores: {} }}
        enviar={{ texto: "Confirmar ajuste", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      >
        <AvisoDeAjuste />
      </FormularioAbm>
    </Ventana>
  );
}

/** Lo que se ve de la sección sin las ventanas: lo dibuja un test con los datos de una base sembrada. */
export function ResumenDeFacturacion({
  facturacion,
  cobro,
}: {
  readonly facturacion: DatosDeFacturacion;
  readonly cobro: readonly LineaDeAvance[];
}) {
  return (
    <>
      <div data-numeros-de-facturacion className="mt-4">
        {facturacion.lineas.map((linea) => (
          <div
            key={linea.moneda}
            className="mb-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4"
          >
            <TarjetaKpi
              titulo={`Devengado a ${facturacion.alMes}`}
              valor={linea.devengado}
            />
            <TarjetaKpi titulo="Por facturar" valor={linea.porFacturar} />
            <TarjetaKpi
              titulo="Saldo de la orden de compra"
              valor={linea.saldoDeOrden === "" ? "—" : linea.saldoDeOrden}
            />
            <TarjetaKpi titulo="Por cobrar (con IVA)" valor={linea.porCobrar} />
          </div>
        ))}
        <GrillaDeMetricas metricas={metricasDeCobro(cobro)} />
      </div>
      {facturacion.cuotas.length > 0 ? (
        <>
          <h3 className="mt-4 mb-2 text-lg font-semibold">Cuota mensual</h3>
          <Tabla cabeceras={["Rige desde", "Cuota sin IVA", "Cargada", "Por"]}>
            {facturacion.cuotas.map((cuota) => (
              <tr key={cuota.id}>
                <td>{cuota.desde}</td>
                <td>{cuota.importe}</td>
                <td>{cuota.cuando}</td>
                <td>{cuota.quien}</td>
              </tr>
            ))}
          </Tabla>
        </>
      ) : null}
    </>
  );
}

/** La ventana de ajustar la cuota, con el formulario que arma el caso de uso. */
export async function AjusteDeCuota({
  servicioId,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly rutaAlCerrar: string;
}) {
  return (
    <VentanaDeAjuste
      servicioId={servicioId}
      rutaAlCerrar={rutaAlCerrar}
      formulario={await armado().facturacion.formularioDeAjuste(servicioId)}
    />
  );
}
