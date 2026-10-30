/**
 * El panel de «En ejecución» (F6-04): en obra, día N. Los hitos con su avance,
 * los recursos afectados, lo facturado y, como acción principal, emitir la
 * factura que admite la modalidad. Finalizar el servicio queda aparte, a la
 * derecha.
 */

import { HandCoins, HardHat, Receipt, SlidersHorizontal } from "lucide-react";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import {
  BarraDeAcciones,
  CabeceraDePanel,
  GrillaDeMetricas,
  TituloDeParte,
} from "../../_ui/panel.tsx";
import { TarjetasDeModalidad } from "../_piezas/modalidad.tsx";
import { PlantillaDeHitos } from "../_piezas/plantilla-de-hitos.tsx";
import { RecursosAgrupados } from "../_piezas/recursos-agrupados.tsx";
import {
  ACCIONES_DE_HITOS,
  ACCIONES_DE_RECURSOS,
} from "./acciones-de-planificacion.ts";
import { Avance } from "./avance.tsx";
import {
  type DatosDePanel,
  dias,
  diasEnEtapa,
  transicionesDelPanel,
} from "./datos-de-panel.ts";
import { Egresos } from "./egresos.tsx";
import { AjusteDeCuota, ResumenDeFacturacion } from "./facturacion.tsx";
import { Facturas } from "./facturas.tsx";
import { Vencimientos } from "./vencimientos.tsx";

export async function PanelEnEjecucion({
  servicio,
  ruta,
  puedeEscribir,
  puedeActuar,
  soloLectura,
  parametros,
}: DatosDePanel) {
  const detalle = await armado().planificacion.ver(servicio.id);
  const facturacion = await armado().facturacion.ver(servicio.id);
  const desdeQueInicio = diasEnEtapa(servicio, "en_ejecucion");
  // El día del arranque es el primero.
  const enObra = desdeQueInicio + 1;
  const hechos = detalle.hitos.filter(({ realizado }) => realizado !== null);
  const propias = {
    servicioId: servicio.id,
    ruta,
    puedeEscribir,
    parametros,
  };
  const { salidas } = transicionesDelPanel(servicio, ruta);
  return (
    <article className="rounded border border-borde bg-superficie p-5 shadow-sm dark:shadow-none">
      <CabeceraDePanel
        Icono={HardHat}
        titulo={`En obra · día ${enObra}`}
        contexto={
          soloLectura
            ? `Estuvo ${dias(desdeQueInicio)} en «En ejecución».`
            : `Inició hace ${dias(desdeQueInicio)}. Tildá los hitos a medida que se cumplen.`
        }
      />
      <GrillaDeMetricas
        metricas={[
          {
            titulo: "Avance de hitos",
            valor:
              detalle.hitos.length === 0
                ? "Sin hitos"
                : `${hechos.length} de ${detalle.hitos.length}`,
            detalle: (
              <progress
                aria-label="Avance de hitos"
                className="mt-1 h-2 w-full"
                max={Math.max(detalle.hitos.length, 1)}
                value={hechos.length}
              />
            ),
          },
          ...facturacion.lineas.flatMap(({ facturadoDeLaOrden }) =>
            facturadoDeLaOrden === null
              ? []
              : [
                  {
                    titulo: "Facturado",
                    valor: facturadoDeLaOrden.importe,
                    detalle: `${facturadoDeLaOrden.porcentaje} % de la OC`,
                  },
                ],
          ),
        ]}
      />
      {facturacion.modalidad === null ? (
        <>
          <TituloDeParte>Modalidad de facturación</TituloDeParte>
          <p className="mb-3">
            Este servicio empezó sin modalidad: elegila para poder facturar. Una
            vez elegida, no se cambia.
          </p>
          <TarjetasDeModalidad
            servicioId={servicio.id}
            facturacion={facturacion}
            ruta={ruta}
            puedeElegir={puedeEscribir}
            parametros={parametros}
          />
        </>
      ) : null}
      <ResumenDeFacturacion facturacion={facturacion} />
      <PlantillaDeHitos
        {...propias}
        detalle={detalle}
        acciones={ACCIONES_DE_HITOS}
      />
      <RecursosAgrupados
        {...propias}
        detalle={detalle}
        acciones={ACCIONES_DE_RECURSOS}
      />
      <Facturas
        servicioId={servicio.id}
        ruta={ruta}
        puedeFacturar={puedeEscribir}
        puedeCobrar={puedeEscribir}
        parametros={parametros}
      />
      <Avance servicioId={servicio.id} />
      <Egresos servicioId={servicio.id} />
      {/* Renovar un contrato se cotiza desde acá: sin vencimientos, la sección no se dibuja. */}
      <Vencimientos
        {...propias}
        puedeRenovar={puedeActuar}
        sinFilasNoSeDibuja
      />
      {puedeEscribir ? (
        <>
          <BarraDeAcciones
            principal={
              facturacion.admiteFactura
                ? {
                    texto: "Emitir factura",
                    href: `${ruta}?factura=1`,
                    Icono: Receipt,
                    carga: "factura",
                  }
                : null
            }
            secundarias={[
              {
                texto: "Registrar egreso",
                href: `/egresos?nuevo=1&servicio=${servicio.id}`,
                Icono: HandCoins,
              },
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
