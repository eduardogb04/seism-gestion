/**
 * El panel de «Cotizado» (F6-01): esperando respuesta del cliente. La
 * cotización vigente, los días desde que se cotizó, la línea de versiones (cada
 * cambio queda, con su motivo) y, como acción principal, cargar la orden de
 * compra.
 */

import {
  CalendarClock,
  FileCheck,
  Files,
  Hourglass,
  Layers,
  Receipt,
  Upload,
} from "lucide-react";
import { ETIQUETAS_DE_ESTADO } from "../../../casos-uso/servicios/formulario.ts";
import type { DetalleDeServicio } from "../../../casos-uso/servicios/servicios.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import {
  BarraDeAcciones,
  CabeceraDePanel,
  GrillaDeMetricas,
  TituloDeParte,
} from "../../_ui/panel.tsx";
import { PORCENTAJE } from "../../_ui/tarjeta-kpi.tsx";
import {
  LineaDeVersiones,
  VentanaDeAnulacion as VentanaDeAnulacionDeCotizacion,
  VentanaDeCarga as VentanaDeCotizacion,
} from "./cotizaciones.tsx";
import {
  cotizacionVigente,
  type DatosDePanel,
  dias,
  diasEnEtapa,
} from "./datos-de-panel.ts";
import { DocumentosDeAlcance } from "./documentos-de-alcance.tsx";
import { VentanaDeCarga as VentanaDeOrden } from "./ordenes-de-compra.tsx";

/** Los días civiles desde el pase de «Creado» a «Cotizado» hasta hoy, sumando los del historial (F3-01). */
function diasDesdeQueSeCotizo({ historial }: DetalleDeServicio): number {
  const cotizo = historial.find(
    ({ de, a }) =>
      de === ETIQUETAS_DE_ESTADO.creado && a === ETIQUETAS_DE_ESTADO.cotizado,
  );
  return cotizo === undefined
    ? 0
    : historial
        .filter(({ posicion }) => posicion >= cotizo.posicion)
        .reduce((total, cambio) => total + cambio.dias, 0);
}

export async function PanelCotizado({
  servicio,
  ruta,
  puedeEscribir,
  soloLectura,
  parametros,
}: DatosDePanel) {
  const cotizaciones = await armado().cotizaciones.listar(servicio.id);
  const vigente = cotizacionVigente(cotizaciones);
  const primera = cotizaciones.at(-1);
  const variacion =
    vigente === null ||
    primera === undefined ||
    cotizaciones.length < 2 ||
    vigente.monto.moneda !== primera.monto.moneda ||
    primera.monto.centavos === 0n
      ? null
      : Number(vigente.monto.centavos - primera.monto.centavos) /
        Number(primera.monto.centavos);
  const desdeQueSeCotizo = diasDesdeQueSeCotizo(servicio);
  const aAnular = parametros.anular;
  return (
    <article className="rounded border border-borde bg-superficie p-5 shadow-sm dark:shadow-none">
      <CabeceraDePanel
        Icono={Hourglass}
        titulo="Esperando respuesta del cliente"
        contexto={
          soloLectura
            ? `Estuvo ${dias(diasEnEtapa(servicio, "cotizado"))} en «Cotizado».`
            : `Cotizado hace ${dias(desdeQueSeCotizo)}.`
        }
      />
      <div data-metricas-de-cotizado>
        <GrillaDeMetricas
          metricas={[
            {
              titulo: "Cotización vigente",
              Icono: Receipt,
              valor: vigente === null ? "Sin cotización" : vigente.importe,
              ...(vigente === null
                ? {}
                : { detalle: `versión ${vigente.version} · ${vigente.fecha}` }),
            },
            {
              titulo: "Días desde que se cotizó",
              Icono: CalendarClock,
              valor: desdeQueSeCotizo,
            },
            {
              titulo: "Versiones",
              Icono: Layers,
              valor: cotizaciones.length,
              ...(variacion === null
                ? {}
                : { detalle: `${PORCENTAJE.format(variacion)} sobre la v1` }),
            },
          ]}
        />
      </div>
      <TituloDeParte>Versiones de la cotización</TituloDeParte>
      {cotizaciones.length === 0 ? (
        <p>Todavía no hay cotizaciones cargadas.</p>
      ) : (
        <LineaDeVersiones
          cotizaciones={cotizaciones}
          ruta={ruta}
          puedeEscribir={puedeEscribir}
        />
      )}
      <DocumentosDeAlcance
        servicioId={servicio.id}
        ruta={ruta}
        puedeEscribir={puedeEscribir}
        parametros={parametros}
      />
      {puedeEscribir ? (
        <>
          <BarraDeAcciones
            principal={{
              texto: "Cargar orden de compra",
              href: `${ruta}?orden=1`,
              Icono: FileCheck,
            }}
            secundarias={[
              {
                texto: "Nueva versión",
                href: `${ruta}?cotizacion=1`,
                Icono: Files,
              },
              {
                texto: "Subir documento de alcance",
                href: `${ruta}?alcance=1`,
                Icono: Upload,
              },
            ]}
            rotuloDeSalidas="¿No salió?"
            salidas={servicio.transiciones.map(({ valor, etiqueta }) => ({
              texto: etiqueta,
              href: `${ruta}?pasar=${valor}`,
            }))}
          />
          {typeof parametros.cotizacion === "string" ? (
            <VentanaDeCotizacion servicioId={servicio.id} rutaAlCerrar={ruta} />
          ) : null}
          {typeof aAnular === "string" ? (
            <VentanaDeAnulacionDeCotizacion
              servicioId={servicio.id}
              cotizacion={cotizaciones.find(({ id }) => id === aAnular)}
              rutaAlCerrar={ruta}
            />
          ) : null}
          {typeof parametros.orden === "string" ? (
            <VentanaDeOrden servicioId={servicio.id} rutaAlCerrar={ruta} />
          ) : null}
        </>
      ) : null}
    </article>
  );
}
