/**
 * `RepositorioAjustesFacturacion` con Prisma (R5): la fila se lee y se escribe
 * con lo mismo que la de un ABM (`crearEscrituraPrisma`).
 */

import { crearImporte } from "../../dominio/compartido/importe.ts";
import type {
  ClaseDeAjuste,
  EstadoDeAjuste,
} from "../../dominio/servicios/ajuste-facturacion.ts";
import type {
  DatosAjusteFacturacion,
  RepositorioAjustesFacturacion,
} from "../../puertos/repositorios/ajustes-facturacion.ts";
import { importeDeColumnas } from "./abm/egresos.ts";
import { crearEscrituraPrisma, desdeFila } from "./abm/repositorio.ts";
import { aFechaHora, aInstante } from "./conversiones.ts";
import type {
  AjusteFacturacion as FilaAjuste,
  Prisma,
} from "./generado/client.ts";

type DatosDeFila = Omit<
  FilaAjuste,
  | "id"
  | "creadoEn"
  | "creadoPor"
  | "actualizadoEn"
  | "actualizadoPor"
  | "eliminadoEn"
  | "eliminadoPor"
>;

const paso = {
  aDatos({
    clase,
    estado,
    importeCentavos,
    importeMoneda,
    precioUnitarioCentavos,
    resueltoEn,
    ...resto
  }: DatosDeFila): DatosAjusteFacturacion {
    const importe = importeDeColumnas(importeCentavos, importeMoneda);
    return {
      ...resto,
      clase: clase as ClaseDeAjuste,
      estado: estado as EstadoDeAjuste,
      importe,
      precioUnitario:
        precioUnitarioCentavos === null
          ? null
          : crearImporte(precioUnitarioCentavos, importe.moneda),
      resueltoEn: resueltoEn === null ? null : aFechaHora(resueltoEn),
    };
  },

  aFila({
    importe,
    precioUnitario,
    resueltoEn,
    ...resto
  }: DatosAjusteFacturacion): DatosDeFila {
    return {
      ...resto,
      importeCentavos: importe.centavos,
      importeMoneda: importe.moneda,
      precioUnitarioCentavos: precioUnitario?.centavos ?? null,
      resueltoEn: resueltoEn === null ? null : aInstante(resueltoEn),
    };
  },
};

/** Un `RepositorioAjustesFacturacion` en la transacción de `cliente`. */
export function crearRepositorioAjustesFacturacionPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioAjustesFacturacion {
  return {
    ...crearEscrituraPrisma<FilaAjuste, DatosAjusteFacturacion>(
      cliente,
      "AjusteFacturacion",
      cliente.ajusteFacturacion,
      paso,
    ),

    async listarDe(servicioId) {
      const filas = await cliente.ajusteFacturacion.findMany({
        where: { servicioId, eliminadoEn: null },
        orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      });
      return filas.map((fila) => desdeFila(fila, paso));
    },

    async pendientes() {
      const filas = await cliente.ajusteFacturacion.findMany({
        where: { estado: "pendiente", eliminadoEn: null },
        include: { servicio: { select: { codigo: true } } },
        orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
      });
      return filas.map(({ servicio, ...fila }) => ({
        ajuste: desdeFila(fila, paso),
        servicioCodigo: servicio.codigo,
      }));
    },
  };
}
