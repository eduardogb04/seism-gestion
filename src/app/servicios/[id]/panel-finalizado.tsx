/**
 * El panel de «Finalizado» (SYSTEM_SPEC §5.3), con el molde de etapa: qué
 * falta para cerrar. El servicio se cierra solo cuando todo lo facturado está
 * cobrado; la acción principal es registrar el cobro que sigue.
 */

import { ClipboardCheck } from "lucide-react";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { AjustesDelServicio } from "../_piezas/ajustes.tsx";
import { PlantillaDeHitos } from "../_piezas/plantilla-de-hitos.tsx";
import { accionPrincipalDe } from "./_molde/accion-principal.ts";
import {
  type ItemDeControl,
  ListaDeControl,
  PanelDeEtapa,
  Seccion,
} from "./_molde/panel-de-etapa.tsx";
import { ACCIONES_DE_HITOS } from "./acciones-de-planificacion.ts";
import {
  type DatosDePanel,
  dias,
  diasEnEtapa,
  esPositivo,
} from "./datos-de-panel.ts";
import { DocumentosDeAlcance } from "./documentos-de-alcance.tsx";
import { Egresos } from "./egresos.tsx";
import { Facturas } from "./facturas.tsx";
import { Vencimientos } from "./vencimientos.tsx";

const DE_FACTURAS = [
  "factura",
  "anularFactura",
  "cambioFactura",
  "cobrar",
  "anularCobro",
  "ajuste",
  "anularAjuste",
];

export async function PanelFinalizado({
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
  const cobranza = await armado().cobros.cobranza(servicio.id);
  const [orden] = await armado().ordenesDeCompra.listar(servicio.id);
  const { egresos } = await armado().egresosDeServicio.listar(servicio.id);
  const propias = {
    servicioId: servicio.id,
    clienteId: servicio.clienteId,
    ruta,
    puedeEscribir,
    parametros,
  };
  const juntar = (valores: readonly string[]) => valores.join(" · ");
  const porFacturar = juntar(
    facturacion.lineas
      .filter(({ porFacturar: importe }) => esPositivo(importe))
      .map(({ porFacturar: importe }) => importe),
  );
  const pendiente = juntar(
    cobro
      .filter(({ pendiente: importe }) => esPositivo(importe))
      .map(({ pendiente: importe }) => importe),
  );
  const facturaACobrar = cobranza.find(({ cobrada }) => !cobrada)?.facturaId;
  const principal = accionPrincipalDe(servicio, ruta, { facturaACobrar });
  const control: ItemDeControl[] = [
    {
      texto: "Todo facturado",
      hecho: porFacturar === "",
      detalle:
        porFacturar === "" ? "nada por facturar" : `falta ${porFacturar}`,
      ...(puedeEscribir && facturacion.admiteFactura
        ? {
            accion: {
              texto: "Emitir factura",
              href: `${ruta}?factura=1`,
              carga: "factura",
            },
          }
        : {}),
    },
    {
      texto: "Todo cobrado",
      hecho: pendiente === "",
      detalle: pendiente === "" ? "sin saldo" : `falta ${pendiente}`,
      ...(puedeEscribir && principal !== null
        ? { accion: { ...principal, texto: "Registrar cobro" } }
        : {}),
    },
  ];
  const faltan = [
    ...(porFacturar === "" ? [] : ["facturar"]),
    ...(pendiente === "" ? [] : ["cobrar"]),
  ];
  const enLaEtapa = dias(diasEnEtapa(servicio, "finalizado"));
  const facturado =
    facturacion.lineas.find(
      ({ facturadoDeLaOrden }) => facturadoDeLaOrden !== null,
    )?.facturadoDeLaOrden ?? undefined;
  return (
    <PanelDeEtapa
      etapa="finalizado"
      Icono={ClipboardCheck}
      titulo="Cerrar el servicio"
      bajada={
        soloLectura
          ? `Estuvo ${enLaEtapa} en «Finalizado».`
          : faltan.length === 0
            ? `Finalizado hace ${enLaEtapa}. Está todo facturado y cobrado: se cierra solo.`
            : `Finalizado hace ${enLaEtapa}. Falta ${faltan.join(" y ")}.`
      }
      metricas={[
        {
          titulo: "Facturado vs OC",
          valor: facturado?.importe ?? "Sin facturar",
          ...(facturado === undefined || orden === undefined
            ? {}
            : { detalle: `de ${orden.total} · ${facturado.porcentaje} %` }),
        },
        {
          titulo: "Cobrado",
          valor: juntar(cobro.map(({ cobrado }) => cobrado)) || "—",
          detalle: "con IVA",
        },
        {
          titulo: "Pendiente de cobro",
          valor: pendiente === "" ? "Sin saldo" : pendiente,
        },
      ]}
      principal={puedeEscribir ? principal : null}
      secundarias={[]}
    >
      <Seccion
        clave="finalizado.control"
        titulo="Para cerrar"
        resumen={`${control.filter(({ hecho }) => hecho).length} de ${control.length}`}
      >
        <ListaDeControl titulo="Para cerrar" items={control} />
      </Seccion>
      <Seccion
        clave="finalizado.facturas"
        titulo="Facturas y cobros"
        parametros={parametros}
        abreCon={DE_FACTURAS}
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
        <AjustesDelServicio enSeccion {...propias} />
      </Seccion>
      <Seccion
        clave="finalizado.vencimientos"
        titulo="Vencimientos"
        abiertaPorDefecto={false}
        parametros={parametros}
        abreCon={["vencimiento", "corregir", "descartar", "renovar"]}
      >
        <Vencimientos
          enSeccion
          {...propias}
          puedeRenovar={puedeActuar}
          sinFilasNoSeDibuja={false}
        />
      </Seccion>
      <Seccion
        clave="finalizado.hitos"
        titulo="Hitos"
        resumen={`${detalle.hitos.filter(({ realizado }) => realizado !== null).length} de ${detalle.hitos.length}`}
        abiertaPorDefecto={false}
      >
        <PlantillaDeHitos
          enSeccion
          {...propias}
          puedeEscribir={false}
          detalle={detalle}
          acciones={ACCIONES_DE_HITOS}
        />
      </Seccion>
      <Seccion
        clave="finalizado.egresos"
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
        clave="finalizado.documentos"
        titulo="Documentación"
        abiertaPorDefecto={false}
        parametros={parametros}
        abreCon={["alcance"]}
      >
        <DocumentosDeAlcance enSeccion {...propias} />
      </Seccion>
    </PanelDeEtapa>
  );
}
