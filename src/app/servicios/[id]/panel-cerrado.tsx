/**
 * El panel de «Cerrado» (F6-04): cerrado, todo cobrado. El resultado (lo que ya
 * calcula la rentabilidad del tablero), lo que duró de la orden de compra al
 * último cobro, los comprobantes en lectura y, como acción principal, cotizar
 * la renovación del próximo vencimiento.
 */

import { CircleCheckBig, FolderOpen, RotateCcw } from "lucide-react";
import { ETIQUETAS_DE_ESTADO } from "../../../casos-uso/servicios/formulario.ts";
import type { DetalleDeServicio } from "../../../casos-uso/servicios/servicios.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import {
  BarraDeAcciones,
  CabeceraDePanel,
  GrillaDeMetricas,
} from "../../_ui/panel.tsx";
import { AjustesDelServicio } from "../_piezas/ajustes.tsx";
import { Avance } from "./avance.tsx";
import { type DatosDePanel, dias, diasEnEtapa } from "./datos-de-panel.ts";
import { DocumentosDeAlcance } from "./documentos-de-alcance.tsx";
import { Egresos } from "./egresos.tsx";
import { Facturas } from "./facturas.tsx";
import { VentanaDeRenovacion } from "./ventana-de-renovacion.tsx";

/** Los días civiles del último pase a «Adjudicado» (la orden de compra) al pase a «Cerrado» (el último cobro), sumando los del historial. */
function diasDeLaOrdenAlCobro({ historial }: DetalleDeServicio): number {
  const cierre = historial.find(({ a }) => a === ETIQUETAS_DE_ESTADO.cerrado);
  const ordenes = historial
    .filter(
      ({ a, posicion }) =>
        a === ETIQUETAS_DE_ESTADO.adjudicado &&
        cierre !== undefined &&
        posicion < cierre.posicion,
    )
    .map(({ posicion }) => posicion);
  return cierre === undefined || ordenes.length === 0
    ? 0
    : historial
        .filter(
          ({ posicion }) =>
            posicion >= Math.max(...ordenes) && posicion < cierre.posicion,
        )
        .reduce((total, cambio) => total + cambio.dias, 0);
}

export async function PanelCerrado({
  servicio,
  ruta,
  puedeActuar,
  soloLectura,
  parametros,
}: DatosDePanel) {
  const resultado = await armado().tablero.resultadoDelServicio(servicio.id);
  const { vencimientos } = await armado().vencimientos.ver(servicio.id);
  const proximo = vencimientos.find(({ pendiente }) => pendiente);
  const aRenovar = vencimientos.find(
    ({ id, pendiente }) => pendiente && id === parametros.renovar,
  );
  const lectura = {
    servicioId: servicio.id,
    ruta,
    puedeEscribir: false,
    parametros,
  };
  return (
    <article className="rounded border border-borde bg-superficie p-5 shadow-sm dark:shadow-none">
      <CabeceraDePanel
        Icono={CircleCheckBig}
        titulo="Cerrado · todo cobrado"
        contexto={
          soloLectura
            ? `Estuvo ${dias(diasEnEtapa(servicio, "cerrado"))} en «Cerrado».`
            : `Cerrado hace ${dias(diasEnEtapa(servicio, "cerrado"))}. Ya no se carga nada: se mira.`
        }
      />
      <GrillaDeMetricas
        metricas={[
          { titulo: "Facturado (sin IVA)", valor: resultado.facturado },
          { titulo: "Egresos del servicio", valor: resultado.egresos },
          { titulo: "Resultado", valor: resultado.resultado },
          { titulo: "Margen", valor: resultado.margen },
          {
            titulo: "De la orden de compra al último cobro",
            valor: dias(diasDeLaOrdenAlCobro(servicio)),
          },
        ]}
      />
      <div id="documentos">
        <Facturas
          servicioId={servicio.id}
          ruta={ruta}
          puedeFacturar={false}
          puedeCobrar={false}
          parametros={parametros}
        />
        <AjustesDelServicio {...lectura} />
        <DocumentosDeAlcance {...lectura} />
      </div>
      <Avance servicioId={servicio.id} />
      <Egresos servicioId={servicio.id} />
      <BarraDeAcciones
        principal={
          puedeActuar && proximo !== undefined
            ? {
                texto: "Cotizar renovación",
                href: `${ruta}?renovar=${proximo.id}`,
                Icono: RotateCcw,
              }
            : null
        }
        secundarias={[
          { texto: "Ver documentos", href: "#documentos", Icono: FolderOpen },
        ]}
        salidas={[]}
      />
      {puedeActuar && aRenovar !== undefined ? (
        <VentanaDeRenovacion
          servicioId={servicio.id}
          vencimientoId={aRenovar.id}
          detalle={`${aRenovar.descripcion} · ${aRenovar.fecha}`}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </article>
  );
}
