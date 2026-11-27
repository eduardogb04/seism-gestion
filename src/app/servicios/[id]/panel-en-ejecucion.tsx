/**
 * El panel de «En ejecución» (SYSTEM_SPEC §5.3), con el molde de etapa: cómo
 * va la obra (avance, facturado, por cobrar, próximo vencimiento) y, como
 * acción principal, emitir la factura que admite la modalidad o, si no hay
 * nada para facturar, finalizar el servicio.
 */

import {
  HandCoins,
  HardHat,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { Enlace } from "../../_ui/enlace-next.ts";
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
  AjustesDeFacturacion,
  DE_AJUSTES_DE_FACTURACION,
} from "./ajustes-de-facturacion.tsx";
import {
  type DatosDePanel,
  dias,
  diasEnEtapa,
  diasHasta,
  proximoVencimiento,
} from "./datos-de-panel.ts";
import { DocumentosDeAlcance } from "./documentos-de-alcance.tsx";
import { Egresos } from "./egresos.tsx";
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
  "anticipo",
  "anularFactura",
  "cambioFactura",
  "cobrar",
  "anularCobro",
  "ajusteDeCuota",
  "verFacturas",
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
  const porCobrarPorMoneda = facturacion.lineas
    .map(({ porCobrar: importe }) => importe)
    .filter(Boolean);
  const porCobrar = porCobrarPorMoneda.join(" · ");
  const proximoDelServicio = proximoVencimiento(vencimientos);
  const facturas = await armado().facturas.listar(servicio.id);
  const cobranza = await armado().cobros.cobranza(servicio.id);
  const conSaldo = facturas.filter(
    ({ id, tipo }) =>
      tipo !== "Nota de crédito" &&
      cobranza.some(({ facturaId, cobrada }) => facturaId === id && !cobrada),
  );
  const vencidas = conSaldo.filter(
    ({ vencimiento }) => diasHasta(vencimiento) < 0,
  ).length;
  /** El próximo de acá en adelante: facturas con saldo y vencimientos del servicio. */
  const proximo = proximoVencimiento(
    [
      ...conSaldo.map(({ vencimiento, numero }) => ({
        fecha: vencimiento,
        descripcion: `Factura ${numero}`,
        pendiente: true,
      })),
      ...vencimientos,
    ].filter(({ fecha, pendiente }) => pendiente && diasHasta(fecha) >= 0),
  );
  const faltan = proximo === undefined ? 0 : diasHasta(proximo.fecha);
  const propias = {
    servicioId: servicio.id,
    clienteId: servicio.clienteId,
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
            {servicio.diaDeObra === null ? (
              <span>En obra hace {dias(desdeQueInicio)}.</span>
            ) : (
              <span>
                En obra · día {servicio.diaDeObra}{" "}
                <span className="text-xs text-texto-3">
                  desde el {servicio.inicioReal}
                </span>
              </span>
            )}
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
              ? facturacion.proximaCuota === null
                ? `Desde ${facturacion.cuotas[0]?.desde ?? ""}`
                : `Próxima cuota: ${facturacion.proximaCuota.fecha} · ${facturacion.proximaCuota.importe}`
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
          valor: porCobrarPorMoneda[0] ?? "—",
          detalle:
            porCobrarPorMoneda.length > 1
              ? `y ${porCobrarPorMoneda.slice(1).join(" · ")}`
              : "facturas sin cobrar",
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
          ...(proximo === undefined && vencidas === 0
            ? {}
            : {
                detalle: (
                  <span className="flex flex-col gap-0.5">
                    {proximo === undefined ? null : (
                      <span>{proximo.descripcion}</span>
                    )}
                    {vencidas === 0 ? null : (
                      <Enlace
                        href={`${ruta}?verFacturas=1`}
                        scroll={false}
                        className="inline-flex items-center gap-1 text-peligro"
                      >
                        <TriangleAlert aria-hidden="true" className="size-3" />
                        {vencidas === 1
                          ? "1 factura vencida"
                          : `${vencidas} facturas vencidas`}
                      </Enlace>
                    )}
                  </span>
                ),
              }),
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
            vigencia={
              servicio.datos.find(([de]) => de === "Vigencia")?.[1] ?? null
            }
            ordenTotal={orden?.total ?? null}
            hitos={
              <PlantillaDeHitos
                enSeccion
                {...propias}
                detalle={detalle}
                acciones={ACCIONES_DE_HITOS}
              />
            }
          />
        </Seccion>
      ) : null}
      <Seccion
        clave="en_ejecucion.hitos"
        titulo="Hitos"
        resumen={`${hechos.length} de ${detalle.hitos.length}`}
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
          ofrecerAnticipo={puedeEscribir}
          parametros={parametros}
          sinFilasNoSeDibuja={false}
        />
        <HistorialDeCuota cuotas={facturacion.cuotas} />
      </Seccion>
      <Seccion
        clave="en_ejecucion.ajustes"
        titulo="Ajustes"
        abiertaPorDefecto={false}
        parametros={parametros}
        abreCon={DE_AJUSTES_DE_FACTURACION}
      >
        <AjustesDeFacturacion enSeccion {...propias} />
      </Seccion>
      <Seccion
        clave="en_ejecucion.vencimientos"
        titulo="Vencimientos"
        resumen={proximoDelServicio?.fecha}
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
      {/* Sin factura no hay orden de compra (§5.1). */}
      {servicio.llevaFactura ? (
        <Seccion
          clave="en_ejecucion.orden"
          titulo="Orden de compra"
          resumen={orden?.numero}
          abiertaPorDefecto={false}
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
