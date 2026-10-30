/**
 * El panel de «Adjudicado» (F6-04): planificar el arranque. La orden de compra,
 * la modalidad de facturación en tres tarjetas, el responsable y el inicio
 * estimado (que se cargan acá mismo), los recursos, los hitos y, como acción
 * principal, iniciar la ejecución.
 */

import { ClipboardList, Receipt, SlidersHorizontal } from "lucide-react";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import {
  BarraDeAcciones,
  CabeceraDePanel,
  GrillaDeMetricas,
  ListaDeControl,
  TituloDeParte,
} from "../../_ui/panel.tsx";
import { TarjetasDeModalidad } from "../_piezas/modalidad.tsx";
import { PlantillaDeHitos } from "../_piezas/plantilla-de-hitos.tsx";
import { RecursosAgrupados } from "../_piezas/recursos-agrupados.tsx";
import { ResponsableEInicio } from "../_piezas/responsable-e-inicio.tsx";
import {
  ACCIONES_DE_HITOS,
  ACCIONES_DE_RECURSOS,
} from "./acciones-de-planificacion.ts";
import { Avance } from "./avance.tsx";
import { CambioDelComprobante } from "./cambio-del-comprobante.tsx";
import {
  type DatosDePanel,
  dias,
  diasEnEtapa,
  transicionesDelPanel,
} from "./datos-de-panel.ts";
import { AjusteDeCuota, ResumenDeFacturacion } from "./facturacion.tsx";
import { Facturas } from "./facturas.tsx";
import { OrdenesDeCompra } from "./ordenes-de-compra.tsx";
import { Vencimientos } from "./vencimientos.tsx";

function cantidad(numero: number, singular: string, plural: string): string {
  return numero === 0
    ? "ninguno"
    : `${numero} ${numero === 1 ? singular : plural}`;
}

export async function PanelAdjudicado({
  servicio,
  ruta,
  puedeEscribir,
  puedeActuar,
  soloLectura,
  parametros,
}: DatosDePanel) {
  const detalle = await armado().planificacion.ver(servicio.id);
  const facturacion = await armado().facturacion.ver(servicio.id);
  const [orden] = await armado().ordenesDeCompra.listar(servicio.id);
  const dato = (etiqueta: string) =>
    servicio.datos.find(([de]) => de === etiqueta)?.[1] ?? "";
  const inicio = dato("Fecha estimada de inicio");
  const propias = {
    servicioId: servicio.id,
    ruta,
    puedeEscribir,
    parametros,
  };
  const { principal, salidas } = transicionesDelPanel(
    servicio,
    ruta,
    "en_ejecucion",
  );
  return (
    <article className="rounded border border-borde bg-superficie p-5 shadow-sm dark:shadow-none">
      <CabeceraDePanel
        Icono={ClipboardList}
        titulo="Planificar el arranque"
        contexto={
          soloLectura
            ? `Estuvo ${dias(diasEnEtapa(servicio, "adjudicado"))} en «Adjudicado».`
            : `Adjudicado hace ${dias(diasEnEtapa(servicio, "adjudicado"))}. Dejá definidos modalidad, responsable, recursos e hitos antes de iniciar.`
        }
      />
      <GrillaDeMetricas
        metricas={[
          {
            titulo: "Orden de compra",
            Icono: Receipt,
            valor: orden === undefined ? "Sin orden vigente" : orden.total,
            ...(orden === undefined
              ? {}
              : {
                  detalle: (
                    <>
                      {orden.numero}
                      {orden.cambio === null ? null : (
                        <>
                          {" · "}
                          <CambioDelComprobante cambio={orden.cambio} />
                        </>
                      )}
                    </>
                  ),
                }),
          },
        ]}
      />
      <TituloDeParte>Modalidad de facturación</TituloDeParte>
      <TarjetasDeModalidad
        servicioId={servicio.id}
        facturacion={facturacion}
        ruta={ruta}
        puedeElegir={puedeEscribir}
        parametros={parametros}
      />
      <ListaDeControl
        titulo="Para arrancar"
        items={[
          {
            texto: "Modalidad",
            hecho: facturacion.modalidad !== null,
            detalle: facturacion.modalidad ?? "sin elegir",
          },
          {
            texto: "Responsable",
            hecho: dato("Responsable") !== "",
            detalle: dato("Responsable") || "sin responsable",
          },
          {
            texto: "Inicio estimado",
            hecho: inicio !== "",
            detalle: inicio || "sin fecha",
          },
          {
            texto: "Recursos",
            hecho: detalle.recursos.length > 0,
            detalle: cantidad(detalle.recursos.length, "cargado", "cargados"),
          },
          {
            texto: "Hitos",
            hecho: detalle.hitos.length > 0,
            detalle: cantidad(detalle.hitos.length, "cargado", "cargados"),
          },
        ]}
      />
      {puedeEscribir ? (
        <ResponsableEInicio servicioId={servicio.id} ruta={ruta} />
      ) : null}
      <ResumenDeFacturacion facturacion={facturacion} />
      <RecursosAgrupados
        {...propias}
        detalle={detalle}
        acciones={ACCIONES_DE_RECURSOS}
      />
      <PlantillaDeHitos
        {...propias}
        detalle={detalle}
        acciones={ACCIONES_DE_HITOS}
      />
      <Facturas
        servicioId={servicio.id}
        ruta={ruta}
        puedeFacturar={puedeEscribir}
        puedeCobrar={puedeEscribir}
        parametros={parametros}
      />
      <Avance servicioId={servicio.id} />
      <OrdenesDeCompra {...propias} />
      {/* Renovar un contrato se cotiza desde acá: sin vencimientos, la sección no se dibuja. */}
      <Vencimientos
        {...propias}
        puedeRenovar={puedeActuar}
        sinFilasNoSeDibuja
      />
      {puedeEscribir ? (
        <>
          <BarraDeAcciones
            principal={principal}
            secundarias={[
              ...(facturacion.admiteFactura
                ? [
                    {
                      texto: "Emitir factura",
                      href: `${ruta}?factura=1`,
                      Icono: Receipt,
                      carga: "factura",
                    },
                  ]
                : []),
              ...(facturacion.esMensual
                ? [
                    {
                      texto: "Ajustar la cuota",
                      href: `${ruta}?ajusteDeCuota=1`,
                      Icono: SlidersHorizontal,
                      carga: "cuota",
                    },
                  ]
                : []),
            ]}
            salidas={salidas}
          />
          {facturacion.esMensual && parametros.ajusteDeCuota === "1" ? (
            <AjusteDeCuota servicioId={servicio.id} rutaAlCerrar={ruta} />
          ) : null}
        </>
      ) : null}
    </article>
  );
}
