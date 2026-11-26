/**
 * La acción principal de cada etapa (SYSTEM_SPEC §5.3), una sola: la usan el
 * encabezado fijo y el panel de la etapa, para que digan lo mismo. Cerrado y las
 * salidas no tienen: vuelven `null`.
 *
 * Las salidas negativas (perdido, sin respuesta, cancelar) van en el menú «⋯»
 * del encabezado, no en el panel.
 */

import {
  CircleCheckBig,
  FileCheck,
  FileText,
  HandCoins,
  Play,
  Receipt,
  Undo2,
} from "lucide-react";
import type { DetalleDeServicio } from "../../../../casos-uso/servicios/servicios.ts";
import type { EstadoServicio } from "../../../../dominio/servicios/estados.ts";
import type { Accion } from "../../../_ui/panel.tsx";

/** Los cambios de etapa que se ofrecen en el menú «⋯» del encabezado. */
export const SALIDAS_NEGATIVAS: readonly EstadoServicio[] = [
  "perdido",
  "sin_respuesta",
  "cancelado",
];

const ofrece = (servicio: DetalleDeServicio, destino: EstadoServicio) =>
  servicio.transiciones.some(({ valor }) => valor === destino);

/** Lo que decide la acción de En ejecución y de Finalizado, que depende de la facturación. */
export type ContextoDeAccion = {
  /** La etapa y la modalidad admiten cargar una factura. */
  readonly facturable?: boolean;
  /** La primera factura con saldo, para «Registrar cobro». */
  readonly facturaACobrar?: string | undefined;
};

/** `ruta`: la del panel de la etapa actual, donde se abren las ventanas. */
export function accionPrincipalDe(
  servicio: DetalleDeServicio,
  ruta: string,
  { facturable = false, facturaACobrar }: ContextoDeAccion = {},
): Accion | null {
  switch (servicio.etapa) {
    case "creado":
      return {
        texto: "Cargar cotización",
        href: `${ruta}?cotizacion=1`,
        Icono: FileText,
      };
    case "cotizado":
      return {
        texto: "Cargar orden de compra",
        href: `${ruta}?orden=1`,
        Icono: FileCheck,
      };
    case "adjudicado":
      return ofrece(servicio, "en_ejecucion")
        ? {
            texto: "Iniciar ejecución",
            href: `${ruta}?pasar=en_ejecucion`,
            Icono: Play,
          }
        : null;
    case "en_ejecucion":
      if (facturable) {
        return {
          texto: "Emitir factura",
          href: `${ruta}?factura=1`,
          Icono: Receipt,
          carga: "factura",
        };
      }
      return ofrece(servicio, "finalizado")
        ? {
            texto: "Finalizar servicio",
            href: `${ruta}?pasar=finalizado`,
            Icono: CircleCheckBig,
          }
        : null;
    case "finalizado":
      return facturaACobrar === undefined
        ? null
        : {
            texto: "Registrar cobro",
            href: `${ruta}?cobrar=${facturaACobrar}`,
            Icono: HandCoins,
            carga: "cobro",
          };
    case "sin_respuesta":
      return ofrece(servicio, "cotizado")
        ? {
            texto: "El cliente volvió",
            href: `${ruta}?pasar=cotizado`,
            Icono: Undo2,
          }
        : null;
    default:
      return null;
  }
}
