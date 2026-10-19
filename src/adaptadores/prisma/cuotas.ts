/**
 * `RepositorioCuotas` con Prisma (F3-03, ADR 0041): la fila se lee y se escribe
 * con lo mismo que la de un ABM (`crearEscrituraPrisma`, con su auditoría); el
 * mes y el importe pasan como en Egresos.
 */

import type {
  DatosCuota,
  RepositorioCuotas,
} from "../../puertos/repositorios/cuotas.ts";
import { aDia, deDia, importeDeColumnas } from "./abm/egresos.ts";
import { crearEscrituraPrisma, desdeFila } from "./abm/repositorio.ts";
import type { ServicioCuota as FilaCuota, Prisma } from "./generado/client.ts";

type DatosDeFila = Omit<
  FilaCuota,
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
    desdeMes,
    importeCentavos,
    importeMoneda,
    ...resto
  }: DatosDeFila): DatosCuota {
    return {
      ...resto,
      desdeMes: aDia(desdeMes),
      importe: importeDeColumnas(importeCentavos, importeMoneda),
    };
  },

  aFila({ desdeMes, importe, ...resto }: DatosCuota): DatosDeFila {
    return {
      ...resto,
      desdeMes: deDia(desdeMes),
      importeCentavos: importe.centavos,
      importeMoneda: importe.moneda,
    };
  },
};

/** Un `RepositorioCuotas` en la transacción de `cliente`. */
export function crearRepositorioCuotasPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioCuotas {
  return {
    ...crearEscrituraPrisma<FilaCuota, DatosCuota>(
      cliente,
      "ServicioCuota",
      cliente.servicioCuota,
      paso,
    ),

    async listarDe(servicioId) {
      const filas = await cliente.servicioCuota.findMany({
        where: { servicioId, eliminadoEn: null },
        orderBy: { posicion: "asc" },
      });
      return filas.map((fila) => desdeFila(fila, paso));
    },

    cantidadDe(servicioId) {
      return cliente.servicioCuota.count({ where: { servicioId } });
    },
  };
}
