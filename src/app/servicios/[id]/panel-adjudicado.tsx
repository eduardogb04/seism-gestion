/**
 * El panel de «Adjudicado» (F6-04, SYSTEM_SPEC §5.3): planificar el arranque.
 * La orden de compra (número, importe, tipo de cambio), la modalidad de
 * facturación en tres tarjetas, el responsable y el inicio estimado (que se
 * cargan acá mismo), los recursos, los hitos y, como acción principal, iniciar
 * la ejecución. Anular la orden está en su sección.
 */

import {
  CalendarClock,
  ClipboardList,
  ListChecks,
  Receipt,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import {
  modalidadDesplegada,
  TarjetasDeModalidad,
} from "../_piezas/modalidad.tsx";
import { PlantillaDeHitos } from "../_piezas/plantilla-de-hitos.tsx";
import { RecursosAgrupados } from "../_piezas/recursos-agrupados.tsx";
import { ResponsableEInicio } from "../_piezas/responsable-e-inicio.tsx";
import { accionPrincipalDe } from "./_molde/accion-principal.ts";
import {
  ListaDeControl,
  PanelDeEtapa,
  Seccion,
} from "./_molde/panel-de-etapa.tsx";
import {
  ACCIONES_DE_HITOS,
  ACCIONES_DE_RECURSOS,
} from "./acciones-de-planificacion.ts";
import { CambioDelComprobante } from "./cambio-del-comprobante.tsx";
import { type DatosDePanel, dias, diasEnEtapa } from "./datos-de-panel.ts";
import { AjusteDeCuota, ResumenDeFacturacion } from "./facturacion.tsx";
import { Facturas } from "./facturas.tsx";
import { OrdenesDeCompra } from "./ordenes-de-compra.tsx";
import { Vencimientos } from "./vencimientos.tsx";

function cantidad(numero: number, singular: string, plural: string): string {
  return numero === 0
    ? "ninguno"
    : `${numero} ${numero === 1 ? singular : plural}`;
}

/** Los parámetros de las ventanas de facturas, cobros y vencimientos: abren la sección «Facturación». */
const DE_FACTURACION = [
  "factura",
  "anticipo",
  "anularFactura",
  "cambioFactura",
  "cobrar",
  "anularCobro",
  "vencimiento",
  "corregir",
  "descartar",
  "renovar",
];

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
  const { servicio: cobro } = await armado().cobros.avance(servicio.id);
  const ordenes = await armado().ordenesDeCompra.listar(servicio.id);
  const [orden] = ordenes;
  const dato = (etiqueta: string) =>
    servicio.datos.find(([de]) => de === etiqueta)?.[1] ?? "";
  const inicio = dato("Fecha estimada de inicio");
  const responsable = dato("Responsable");
  const propias = {
    servicioId: servicio.id,
    clienteId: servicio.clienteId,
    ruta,
    puedeEscribir,
    parametros,
  };
  const hitosEnModalidad =
    modalidadDesplegada(facturacion, parametros) === "por_hitos";
  const listaDeHitos = (
    <PlantillaDeHitos
      enSeccion
      {...propias}
      detalle={detalle}
      acciones={ACCIONES_DE_HITOS}
    />
  );
  const control = [
    {
      texto: "Modalidad de facturación",
      hecho: facturacion.modalidad !== null,
      detalle: facturacion.modalidad ?? "sin elegir",
    },
    {
      texto: "Responsable",
      hecho: responsable !== "",
      detalle: responsable || "sin responsable",
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
  ];
  const listos = control.filter(({ hecho }) => hecho).length;
  const principal = accionPrincipalDe(servicio, ruta);
  const enLaEtapa = dias(diasEnEtapa(servicio, "adjudicado"));
  return (
    <PanelDeEtapa
      etapa="adjudicado"
      Icono={ClipboardList}
      titulo="Planificar el arranque"
      bajada={
        soloLectura
          ? `Estuvo ${enLaEtapa} en «Adjudicado».`
          : facturacion.modalidad === null
            ? `Adjudicado hace ${enLaEtapa}. Elegí la modalidad de facturación: sin ella no se puede iniciar.`
            : `Adjudicado hace ${enLaEtapa}. Dejá definidos responsable, recursos e hitos antes de iniciar.`
      }
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
        {
          titulo: "Facturación",
          Icono: Wallet,
          valor: facturacion.modalidad ?? "Sin elegir",
        },
        {
          titulo: "Inicio estimado",
          Icono: CalendarClock,
          valor: inicio || "Sin fecha",
        },
        {
          titulo: "Para arrancar",
          Icono: ListChecks,
          valor: `${listos} de ${control.length}`,
        },
      ]}
      principal={puedeEscribir ? principal : null}
      secundarias={
        puedeEscribir
          ? [
              ...(facturacion.admiteFactura
                ? [
                    {
                      texto: servicio.llevaFactura
                        ? "Emitir factura"
                        : "Emitir comprobante",
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
            ]
          : []
      }
    >
      <Seccion
        clave="adjudicado.control"
        titulo="Para arrancar"
        resumen={`${listos} de ${control.length}`}
      >
        <ListaDeControl titulo="Para arrancar" items={control} />
      </Seccion>
      <Seccion
        clave="adjudicado.modalidad"
        titulo="Modalidad de facturación"
        resumen={facturacion.modalidad ?? "sin elegir"}
        parametros={parametros}
        abreCon={["modalidad"]}
      >
        <TarjetasDeModalidad
          servicioId={servicio.id}
          facturacion={facturacion}
          ruta={ruta}
          puedeElegir={puedeEscribir}
          parametros={parametros}
          vigencia={dato("Vigencia") || null}
          ordenTotal={orden?.total ?? null}
          hitos={listaDeHitos}
        />
      </Seccion>
      {puedeEscribir ? (
        <Seccion
          clave="adjudicado.responsable"
          titulo="Responsable e inicio estimado"
        >
          <div className="max-w-md">
            <ResponsableEInicio
              enSeccion
              servicioId={servicio.id}
              ruta={ruta}
            />
          </div>
        </Seccion>
      ) : null}
      <Seccion
        clave="adjudicado.recursos"
        titulo="Recursos"
        resumen={cantidad(detalle.recursos.length, "recurso", "recursos")}
        parametros={parametros}
        abreCon={["recurso"]}
      >
        <RecursosAgrupados
          enSeccion
          {...propias}
          detalle={detalle}
          acciones={ACCIONES_DE_RECURSOS}
        />
      </Seccion>
      {hitosEnModalidad ? null : (
        <Seccion
          clave="adjudicado.hitos"
          titulo="Hitos"
          resumen={cantidad(detalle.hitos.length, "hito", "hitos")}
          parametros={parametros}
          abreCon={["hito"]}
        >
          {listaDeHitos}
        </Seccion>
      )}
      {/* Sin factura no hay orden de compra (§5.1). */}
      {servicio.llevaFactura ? (
        <Seccion
          clave="adjudicado.orden"
          titulo="Orden de compra"
          resumen={orden?.numero}
          parametros={parametros}
          abreCon={[
            "anularOrden",
            "cambioOrden",
            "ampliar",
            "reemplazar",
            "anularAmpliacion",
          ]}
        >
          <OrdenesDeCompra enSeccion {...propias} />
        </Seccion>
      ) : null}
      <Seccion
        clave="adjudicado.facturacion"
        titulo="Facturación y cobros"
        abiertaPorDefecto={false}
        parametros={parametros}
        abreCon={DE_FACTURACION}
      >
        <ResumenDeFacturacion facturacion={facturacion} cobro={cobro} />
        <Facturas
          servicioId={servicio.id}
          ruta={ruta}
          puedeFacturar={puedeEscribir}
          puedeCobrar={puedeEscribir}
          ofrecerAnticipo={puedeEscribir}
          parametros={parametros}
          sinFilasNoSeDibuja={!(puedeEscribir && facturacion.admiteFactura)}
        />
        {/* Renovar un contrato se cotiza desde acá: sin vencimientos, la sección no se dibuja. */}
        <Vencimientos
          {...propias}
          puedeRenovar={puedeActuar}
          sinFilasNoSeDibuja
        />
      </Seccion>
      {puedeEscribir &&
      facturacion.esMensual &&
      parametros.ajusteDeCuota === "1" ? (
        <AjusteDeCuota servicioId={servicio.id} rutaAlCerrar={ruta} />
      ) : null}
    </PanelDeEtapa>
  );
}
