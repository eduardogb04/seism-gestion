/**
 * El panel de «Finalizado» (F6-04): falta cobrar para cerrar. Lo que falta
 * facturar y cobrar, los comprobantes con su saldo (cada uno con «Registrar
 * cobro»), los ajustes (notas de crédito y de débito, factura adicional) y los
 * vencimientos generados. Cobrar todo lo facturado lo cierra.
 */

import { HandCoins, Receipt } from "lucide-react";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { BarraDeAcciones, CabeceraDePanel } from "../../_ui/panel.tsx";
import { AjustesDelServicio } from "../_piezas/ajustes.tsx";
import { type DatosDePanel, dias, diasEnEtapa } from "./datos-de-panel.ts";
import { Egresos } from "./egresos.tsx";
import { ResumenDeFacturacion } from "./facturacion.tsx";
import { Facturas } from "./facturas.tsx";
import { Vencimientos } from "./vencimientos.tsx";

export async function PanelFinalizado({
  servicio,
  ruta,
  puedeEscribir,
  puedeActuar,
  soloLectura,
  parametros,
}: DatosDePanel) {
  const facturacion = await armado().facturacion.ver(servicio.id);
  const { servicio: cobro } = await armado().cobros.avance(servicio.id);
  const propias = {
    servicioId: servicio.id,
    ruta,
    puedeEscribir,
    parametros,
  };
  return (
    <article className="rounded border border-borde bg-superficie p-5 shadow-sm dark:shadow-none">
      <CabeceraDePanel
        Icono={HandCoins}
        titulo="Falta cobrar para cerrar"
        contexto={
          soloLectura
            ? `Estuvo ${dias(diasEnEtapa(servicio, "finalizado"))} en «Finalizado».`
            : `Finalizado hace ${dias(diasEnEtapa(servicio, "finalizado"))}. Cuando se cobra todo lo facturado, el servicio se cierra solo.`
        }
      />
      <ResumenDeFacturacion facturacion={facturacion} cobro={cobro} />
      <Facturas
        servicioId={servicio.id}
        ruta={ruta}
        puedeFacturar={puedeEscribir}
        puedeCobrar={puedeEscribir}
        parametros={parametros}
        sinFilasNoSeDibuja={false}
      />
      <AjustesDelServicio {...propias} />
      <Egresos servicioId={servicio.id} sinFilasNoSeDibuja={false} />
      <Vencimientos
        {...propias}
        puedeRenovar={puedeActuar}
        sinFilasNoSeDibuja={false}
      />
      {puedeEscribir && facturacion.admiteFactura ? (
        <BarraDeAcciones
          principal={null}
          secundarias={[
            {
              texto: "Emitir factura",
              href: `${ruta}?factura=1`,
              Icono: Receipt,
              carga: "factura",
            },
          ]}
          salidas={[]}
        />
      ) : null}
    </article>
  );
}
