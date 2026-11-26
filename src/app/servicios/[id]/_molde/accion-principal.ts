/**
 * La acción principal de cada etapa (SYSTEM_SPEC §5.3), una sola: la usan el
 * encabezado fijo y el panel de la etapa, para que digan lo mismo. Las etapas
 * que todavía no tienen la suya acá (En ejecución, Finalizado, Cerrado) vuelven
 * `null`: el dev de esos paneles la agrega en esta tabla.
 *
 * Las salidas negativas (perdido, sin respuesta, cancelar) van en el menú «⋯»
 * del encabezado, no en el panel.
 */

import { FileCheck, FileText, Play, Undo2 } from "lucide-react";
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

/** `ruta`: la del panel de la etapa actual, donde se abren las ventanas. */
export function accionPrincipalDe(
  servicio: DetalleDeServicio,
  ruta: string,
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
