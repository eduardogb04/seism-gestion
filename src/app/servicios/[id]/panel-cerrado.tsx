/**
 * El panel de «Cerrado» (SYSTEM_SPEC §5.3), con el molde de etapa: un resumen
 * de solo lectura (orden de compra, facturado, cobrado, duración), con los
 * comprobantes y documentos plegados. Sin acción principal: lo único que se
 * ofrece, discreto, es cotizar la renovación del próximo vencimiento.
 */

import { CircleCheckBig, RotateCcw } from "lucide-react";
import { ETIQUETAS_DE_ESTADO } from "../../../casos-uso/servicios/formulario.ts";
import type { DetalleDeServicio } from "../../../casos-uso/servicios/servicios.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { AjustesDelServicio } from "../_piezas/ajustes.tsx";
import { PlantillaDeHitos } from "../_piezas/plantilla-de-hitos.tsx";
import {
  MetricaChica,
  PanelDeEtapa,
  Seccion,
} from "./_molde/panel-de-etapa.tsx";
import { ACCIONES_DE_HITOS } from "./acciones-de-planificacion.ts";
import {
  type DatosDePanel,
  dias,
  diasEnEtapa,
  proximoVencimiento,
} from "./datos-de-panel.ts";
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
  const detalle = await armado().planificacion.ver(servicio.id);
  const facturacion = await armado().facturacion.ver(servicio.id);
  const { servicio: cobro } = await armado().cobros.avance(servicio.id);
  const [orden] = await armado().ordenesDeCompra.listar(servicio.id);
  const { vencimientos } = await armado().vencimientos.ver(servicio.id);
  const proximo = proximoVencimiento(vencimientos);
  const aRenovar = vencimientos.find(
    ({ id, pendiente }) => pendiente && id === parametros.renovar,
  );
  const lectura = {
    servicioId: servicio.id,
    ruta,
    puedeEscribir: false,
    parametros,
  };
  const duracion = diasDeLaOrdenAlCobro(servicio);
  const cierre = servicio.historial.find(
    ({ a }) => a === ETIQUETAS_DE_ESTADO.cerrado,
  );
  const facturado =
    facturacion.lineas.find(
      ({ facturadoDeLaOrden }) => facturadoDeLaOrden !== null,
    )?.facturadoDeLaOrden ?? undefined;
  const enLaEtapa = dias(diasEnEtapa(servicio, "cerrado"));
  return (
    <PanelDeEtapa
      etapa="cerrado"
      Icono={CircleCheckBig}
      titulo="Servicio cerrado"
      bajada={
        soloLectura
          ? `Estuvo ${enLaEtapa} en «Cerrado».`
          : `Cerrado ${cierre === undefined ? "" : `el ${cierre.cuando.slice(0, 10)} `}tras ${dias(duracion)} de la orden de compra al último cobro. Ya no se carga nada: se mira.`
      }
      metricas={[
        { titulo: "Importe OC", valor: orden?.total ?? "Sin orden" },
        {
          titulo: "Facturado",
          valor: facturado?.importe ?? resultado.facturado,
          detalle: "sin IVA",
        },
        {
          titulo: "Cobrado",
          valor: cobro.map(({ cobrado }) => cobrado).join(" · ") || "—",
          detalle: "con IVA",
        },
        { titulo: "Duración", valor: dias(duracion) },
      ]}
      principal={null}
      secundarias={
        puedeActuar && proximo !== undefined
          ? [
              {
                texto: "Cotizar renovación",
                href: `${ruta}?renovar=${proximo.id}`,
                Icono: RotateCcw,
              },
            ]
          : []
      }
    >
      <Seccion
        clave="cerrado.hitos"
        titulo="Hitos"
        resumen={`${detalle.hitos.length}`}
        abiertaPorDefecto={false}
      >
        <PlantillaDeHitos
          enSeccion
          {...lectura}
          detalle={detalle}
          acciones={ACCIONES_DE_HITOS}
        />
      </Seccion>
      <Seccion
        clave="cerrado.facturas"
        titulo="Facturas y cobros"
        abiertaPorDefecto={false}
      >
        <Facturas
          enSeccion
          servicioId={servicio.id}
          ruta={ruta}
          puedeFacturar={false}
          puedeCobrar={false}
          parametros={parametros}
          sinFilasNoSeDibuja={false}
        />
        <AjustesDelServicio enSeccion {...lectura} />
      </Seccion>
      <Seccion
        clave="cerrado.resultado"
        titulo="Resultado"
        resumen={resultado.margen}
        abiertaPorDefecto={false}
      >
        <div className="flex flex-wrap gap-px overflow-hidden rounded-tarjeta border border-borde bg-borde">
          <MetricaChica titulo="Egresos" valor={resultado.egresos} />
          <MetricaChica titulo="Resultado" valor={resultado.resultado} />
          <MetricaChica titulo="Margen" valor={resultado.margen} />
        </div>
        <Egresos enSeccion servicioId={servicio.id} sinFilasNoSeDibuja />
      </Seccion>
      <Seccion
        clave="cerrado.documentos"
        titulo="Documentación"
        abiertaPorDefecto={false}
      >
        <DocumentosDeAlcance enSeccion {...lectura} />
      </Seccion>
      {puedeActuar && aRenovar !== undefined ? (
        <VentanaDeRenovacion
          servicioId={servicio.id}
          vencimientoId={aRenovar.id}
          detalle={`${aRenovar.descripcion} · ${aRenovar.fecha}`}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </PanelDeEtapa>
  );
}
