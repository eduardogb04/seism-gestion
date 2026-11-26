/**
 * El panel de «En ejecución» (SYSTEM_SPEC §5.3), con el molde de etapa: cómo
 * va la obra (avance, facturado, por cobrar, próximo vencimiento) y, como
 * acción principal, emitir la factura que admite la modalidad o, si no hay
 * nada para facturar, finalizar el servicio.
 */

import { HandCoins, HardHat, SlidersHorizontal } from "lucide-react";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { TarjetasDeModalidad } from "../_piezas/modalidad.tsx";
import { PlantillaDeHitos } from "../_piezas/plantilla-de-hitos.tsx";
import { RecursosAgrupados } from "../_piezas/recursos-agrupados.tsx";
import { accionPrincipalDe } from "./_molde/accion-principal.ts";
import { PanelDeEtapa, Seccion } from "./_molde/panel-de-etapa.tsx";
import { Persona } from "./_molde/persona.tsx";
import {
  ACCIONES_DE_HITOS,
  ACCIONES_DE_RECURSOS,
} from "./acciones-de-planificacion.ts";
import {
  type DatosDePanel,
  dias,
  diasEnEtapa,
  diasHasta,
  proximoVencimiento,
} from "./datos-de-panel.ts";
import { DocumentosDeAlcance } from "./documentos-de-alcance.tsx";
import { Egresos } from "./egresos.tsx";
import { EnlaceDeSeccion } from "./enlace-de-seccion.tsx";
import { AjusteDeCuota, HistorialDeCuota } from "./facturacion.tsx";
import { Facturas } from "./facturas.tsx";
import { OrdenesDeCompra } from "./ordenes-de-compra.tsx";
import { Vencimientos } from "./vencimientos.tsx";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** El número de mes de una cuota mensual, contando el de arranque (`agosto de 2026`); `null` si no se entiende. */
function mesesDesde(desde: string): number | null {
  const [nombre = "", , anio = ""] = desde.split(" ");
  const mes = MESES.indexOf(nombre);
  const hoy = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const [anioHoy = 0, mesHoy = 0] = hoy.split("-").map(Number);
  if (mes < 0 || Number.isNaN(Number(anio))) {
    return null;
  }
  return Math.max(1, (anioHoy - Number(anio)) * 12 + (mesHoy - 1 - mes) + 1);
}

/** Los parámetros de las ventanas de facturas, cobros y cuota: abren la sección «Facturas y cobros». */
const DE_FACTURACION = [
  "factura",
  "anularFactura",
  "cambioFactura",
  "cobrar",
  "anularCobro",
  "ajusteDeCuota",
];

const DE_VENCIMIENTOS = ["vencimiento", "corregir", "descartar", "renovar"];

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
  const [orden] = await armado().ordenesDeCompra.listar(servicio.id);
  const { vencimientos } = await armado().vencimientos.ver(servicio.id);
  const { egresos } = await armado().egresosDeServicio.listar(servicio.id);
  const responsable =
    servicio.datos.find(([de]) => de === "Responsable")?.[1] ?? "";
  const desdeQueInicio = diasEnEtapa(servicio, "en_ejecucion");
  const hechos = detalle.hitos.filter(({ realizado }) => realizado !== null);
  const meses = facturacion.esMensual
    ? mesesDesde(facturacion.cuotas[0]?.desde ?? "")
    : null;
  const facturado =
    facturacion.lineas.find(
      ({ facturadoDeLaOrden }) => facturadoDeLaOrden !== null,
    )?.facturadoDeLaOrden ?? undefined;
  const porCobrar = facturacion.lineas
    .map(({ porCobrar: importe }) => importe)
    .join(" · ");
  const proximo = proximoVencimiento(vencimientos);
  const faltan = proximo === undefined ? 0 : diasHasta(proximo.fecha);
  const propias = {
    servicioId: servicio.id,
    ruta,
    puedeEscribir,
    parametros,
  };
  const principal = accionPrincipalDe(servicio, ruta, {
    facturable: facturacion.admiteFactura,
  });
  const puedeFinalizar =
    principal?.texto !== "Finalizar servicio" &&
    servicio.transiciones.some(({ valor }) => valor === "finalizado");
  const puedePlanificar = puedeEscribir && detalle.planificable;
  return (
    <PanelDeEtapa
      etapa="en_ejecucion"
      Icono={HardHat}
      titulo="En ejecución"
      bajada={
        soloLectura ? (
          `Estuvo ${dias(desdeQueInicio)} en «En ejecución».`
        ) : (
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <span>En obra hace {dias(desdeQueInicio)}.</span>
            <span className="inline-flex items-center gap-1.5">
              Responsable: <Persona quien={responsable} chica />
            </span>
          </span>
        )
      }
      metricas={[
        {
          titulo: "Avance",
          valor:
            meses !== null
              ? `Mes ${meses}`
              : detalle.hitos.length === 0
                ? "Sin hitos"
                : `${hechos.length} de ${detalle.hitos.length}`,
          detalle:
            meses !== null
              ? `Desde ${facturacion.cuotas[0]?.desde ?? ""}`
              : "hitos hechos",
        },
        {
          titulo: "Facturado",
          valor: facturado?.importe ?? "Sin facturar",
          ...(facturado === undefined || orden === undefined
            ? {}
            : { detalle: `de ${orden.total} · ${facturado.porcentaje} %` }),
        },
        {
          titulo: "Por cobrar",
          valor: porCobrar || "—",
          detalle: "facturas sin cobrar",
        },
        {
          titulo: "Próximo vencimiento",
          valor:
            proximo === undefined ? (
              "Ninguno"
            ) : (
              <span
                className={
                  faltan < 0
                    ? "text-peligro"
                    : faltan <= 7
                      ? "text-aviso"
                      : undefined
                }
              >
                {proximo.fecha}
              </span>
            ),
          ...(proximo === undefined ? {} : { detalle: proximo.descripcion }),
        },
      ]}
      principal={puedeEscribir ? principal : null}
      secundarias={
        puedeEscribir
          ? [
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
              ...(puedeFinalizar
                ? [
                    {
                      texto: "Finalizar servicio",
                      href: `${ruta}?pasar=finalizado`,
                    },
                  ]
                : []),
            ]
          : []
      }
    >
      {facturacion.modalidad === null ? (
        <Seccion
          clave="en_ejecucion.modalidad"
          titulo="Modalidad de facturación"
          resumen="sin elegir"
          parametros={parametros}
          abreCon={["modalidad"]}
        >
          <p className="mt-0 mb-3 text-[13px] text-texto-2">
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
        </Seccion>
      ) : null}
      <Seccion
        clave="en_ejecucion.hitos"
        titulo="Hitos"
        resumen={`${hechos.length} de ${detalle.hitos.length}`}
        extra={
          puedePlanificar ? (
            <EnlaceDeSeccion
              texto="Agregar hito"
              href={`${ruta}?hito=1`}
              carga="planificacion"
            />
          ) : undefined
        }
        parametros={parametros}
        abreCon={["hito"]}
      >
        <PlantillaDeHitos
          enSeccion
          {...propias}
          detalle={detalle}
          acciones={ACCIONES_DE_HITOS}
        />
      </Seccion>
      <Seccion
        clave="en_ejecucion.facturas"
        titulo="Facturas y cobros"
        resumen={porCobrar === "" ? undefined : `por cobrar ${porCobrar}`}
        parametros={parametros}
        abreCon={DE_FACTURACION}
      >
        <Facturas
          enSeccion
          servicioId={servicio.id}
          ruta={ruta}
          puedeFacturar={puedeEscribir}
          puedeCobrar={puedeEscribir}
          parametros={parametros}
          sinFilasNoSeDibuja={false}
        />
        <HistorialDeCuota cuotas={facturacion.cuotas} />
      </Seccion>
      <Seccion
        clave="en_ejecucion.vencimientos"
        titulo="Vencimientos"
        resumen={proximo?.fecha}
        parametros={parametros}
        abreCon={DE_VENCIMIENTOS}
      >
        <Vencimientos
          enSeccion
          {...propias}
          puedeRenovar={puedeActuar}
          sinFilasNoSeDibuja={false}
        />
      </Seccion>
      <Seccion
        clave="en_ejecucion.recursos"
        titulo="Recursos"
        resumen={`${detalle.recursos.length}`}
        extra={
          puedePlanificar ? (
            <EnlaceDeSeccion
              texto="Agregar recurso"
              href={`${ruta}?recurso=1`}
              carga="planificacion"
            />
          ) : undefined
        }
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
      <Seccion
        clave="en_ejecucion.orden"
        titulo="Orden de compra"
        resumen={orden?.numero}
        abiertaPorDefecto={false}
        parametros={parametros}
        abreCon={["anularOrden", "cambioOrden"]}
      >
        <OrdenesDeCompra enSeccion {...propias} />
      </Seccion>
      <Seccion
        clave="en_ejecucion.egresos"
        titulo="Egresos"
        resumen={`${egresos.length}`}
        abiertaPorDefecto={false}
      >
        <Egresos
          enSeccion
          servicioId={servicio.id}
          sinFilasNoSeDibuja={false}
        />
      </Seccion>
      <Seccion
        clave="en_ejecucion.documentos"
        titulo="Documentación"
        abiertaPorDefecto={false}
        parametros={parametros}
        abreCon={["alcance"]}
      >
        <DocumentosDeAlcance enSeccion {...propias} />
      </Seccion>
      {puedeEscribir &&
      facturacion.esMensual &&
      parametros.ajusteDeCuota === "1" ? (
        <AjusteDeCuota servicioId={servicio.id} rutaAlCerrar={ruta} />
      ) : null}
    </PanelDeEtapa>
  );
}
