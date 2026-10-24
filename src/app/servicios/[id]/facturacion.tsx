/**
 * La sección *Facturación* de la pantalla de un servicio (F3-03, ADR 0041): la
 * modalidad, el historial de la cuota mensual y, por moneda y al mes del reloj,
 * lo devengado, lo que falta facturar, el saldo de la orden de compra y lo que
 * falta cobrar. Elegir la modalidad (`?modalidad=1`) y ajustar la cuota
 * (`?ajusteDeCuota=1`, con su aviso antes de confirmar) son ventanas sobre esta
 * misma pantalla.
 */

import type {
  CasosUsoFacturacion,
  Facturacion as DatosDeFacturacion,
} from "../../../casos-uso/servicios/facturacion.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { ajustarCuota, cambiarModalidadDeFacturacion } from "../acciones.ts";
import { AvisoDeAjuste } from "./aviso-de-ajuste.tsx";

async function VentanaDeModalidad({
  servicioId,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly rutaAlCerrar: string;
}) {
  const { campos, escrito } =
    await armado().facturacion.formularioDeModalidad(servicioId);
  return (
    <Ventana titulo="Modalidad de facturación" rutaAlCerrar={rutaAlCerrar}>
      <p className="mb-4">
        Se puede cambiar mientras el servicio no tenga facturas. Mensual pide la
        cuota sin IVA, en la moneda de la orden de compra, y el mes de inicio.
      </p>
      <FormularioAbm
        accion={cambiarModalidadDeFacturacion.bind(null, servicioId)}
        campos={campos}
        elegibles={{}}
        inicial={{ escrito, errores: {} }}
        enviar={{ texto: "Guardar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

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
}: {
  readonly facturacion: DatosDeFacturacion;
}) {
  return (
    <>
      <p className="mb-3" data-modalidad>
        Modalidad:{" "}
        {facturacion.modalidad ?? "sin elegir (hace falta para facturar)"}
      </p>
      {facturacion.lineas.length > 0 ? (
        <Tabla
          cabeceras={[
            "Moneda",
            `Devengado a ${facturacion.alMes}`,
            "Por facturar",
            "Saldo de la orden de compra",
            "Por cobrar (con IVA)",
          ]}
        >
          {facturacion.lineas.map((linea) => (
            <tr key={linea.moneda}>
              <td>{linea.moneda}</td>
              <td>{linea.devengado}</td>
              <td>{linea.porFacturar}</td>
              <td>{linea.saldoDeOrden}</td>
              <td>{linea.porCobrar}</td>
            </tr>
          ))}
        </Tabla>
      ) : null}
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

export async function Facturacion({
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
  const facturacion = await armado().facturacion.ver(servicioId);
  const formularioDeAjuste =
    puedeEscribir &&
    facturacion.esMensual &&
    typeof parametros.ajusteDeCuota === "string"
      ? await armado().facturacion.formularioDeAjuste(servicioId)
      : null;
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Facturación</h2>
      {puedeEscribir ? (
        <p className="mb-3 flex gap-2">
          <Enlace
            href={`${ruta}?modalidad=1`}
            scroll={false}
            className={clasesDeBoton("secundario")}
          >
            {facturacion.modalidad === null
              ? "Elegir la modalidad"
              : "Cambiar la modalidad"}
          </Enlace>
          {facturacion.esMensual ? (
            <Enlace
              href={`${ruta}?ajusteDeCuota=1`}
              scroll={false}
              className={clasesDeBoton("secundario")}
            >
              Ajustar la cuota
            </Enlace>
          ) : null}
        </p>
      ) : null}
      <ResumenDeFacturacion facturacion={facturacion} />
      {puedeEscribir && typeof parametros.modalidad === "string" ? (
        <VentanaDeModalidad servicioId={servicioId} rutaAlCerrar={ruta} />
      ) : null}
      {formularioDeAjuste === null ? null : (
        <VentanaDeAjuste
          servicioId={servicioId}
          rutaAlCerrar={ruta}
          formulario={formularioDeAjuste}
        />
      )}
    </section>
  );
}
