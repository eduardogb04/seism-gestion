/**
 * `RepositorioOrdenesCompra` con Prisma (F2-06, ADR 0036): la fila se lee y se
 * escribe con lo mismo que la de un ABM (`crearEscrituraPrisma`, con su
 * auditoría); la fecha y el importe pasan como en Egresos.
 */

import type {
  DatosOrdenCompra,
  RepositorioOrdenesCompra,
} from "../../puertos/repositorios/ordenes-de-compra.ts";
import { aDia, deDia, importeDeColumnas } from "./abm/egresos.ts";
import { crearEscrituraPrisma, desdeFila } from "./abm/repositorio.ts";
import type {
  OrdenCompra as FilaOrdenCompra,
  Prisma,
} from "./generado/client.ts";

type DatosDeFila = Omit<
  FilaOrdenCompra,
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
    fecha,
    importeCentavos,
    importeMoneda,
    ...resto
  }: DatosDeFila): DatosOrdenCompra {
    return {
      ...resto,
      fecha: aDia(fecha),
      importe: importeDeColumnas(importeCentavos, importeMoneda),
    };
  },

  aFila({ fecha, importe, ...resto }: DatosOrdenCompra): DatosDeFila {
    return {
      ...resto,
      fecha: deDia(fecha),
      importeCentavos: importe.centavos,
      importeMoneda: importe.moneda,
    };
  },
};

/** Un `RepositorioOrdenesCompra` en la transacción de `cliente`. */
export function crearRepositorioOrdenesCompraPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioOrdenesCompra {
  return {
    ...crearEscrituraPrisma<FilaOrdenCompra, DatosOrdenCompra>(
      cliente,
      "OrdenCompra",
      cliente.ordenCompra,
      paso,
    ),

    async listarDe(servicioId) {
      const filas = await cliente.ordenCompra.findMany({
        where: { servicioId, eliminadoEn: null },
        orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }, { id: "desc" }],
      });
      return filas.map((fila) => desdeFila(fila, paso));
    },
  };
}
