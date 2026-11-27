/**
 * `RepositorioAmpliacionesOrdenCompra` con Prisma (R1): la fila se lee y se
 * escribe con lo mismo que la de un ABM (`crearEscrituraPrisma`).
 */

import type {
  DatosAmpliacionOrdenCompra,
  RepositorioAmpliacionesOrdenCompra,
} from "../../puertos/repositorios/ampliaciones-de-oc.ts";
import { aDia, deDia } from "./abm/egresos.ts";
import { crearEscrituraPrisma, desdeFila } from "./abm/repositorio.ts";
import type {
  AmpliacionOrdenCompra as FilaAmpliacion,
  Prisma,
} from "./generado/client.ts";

/** La moneda de la orden se resuelve en el caso de uso: la fila solo guarda centavos. */
const MONEDA_PENDIENTE = MONEDAS[0];

type DatosDeFila = Omit<
  FilaAmpliacion,
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
    nuevaFechaFin,
    ...resto
  }: DatosDeFila): DatosAmpliacionOrdenCompra {
    return {
      ...resto,
      fecha: aDia(fecha),
      nuevaFechaFin: nuevaFechaFin === null ? null : aDia(nuevaFechaFin),
    };
  },

  aFila({
    fecha,
    nuevaFechaFin,
    ...resto
  }: DatosAmpliacionOrdenCompra): DatosDeFila {
    return {
      ...resto,
      fecha: deDia(fecha),
      nuevaFechaFin: nuevaFechaFin === null ? null : deDia(nuevaFechaFin),
    };
  },
};

/** Un `RepositorioAmpliacionesOrdenCompra` en la transacción de `cliente`. */
export function crearRepositorioAmpliacionesOrdenCompraPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioAmpliacionesOrdenCompra {
  return {
    ...crearEscrituraPrisma<FilaAmpliacion, DatosAmpliacionOrdenCompra>(
      cliente,
      "AmpliacionOrdenCompra",
      cliente.ampliacionOrdenCompra,
      paso,
    ),

    async listarDe(ordenCompraIds) {
      const filas = await cliente.ampliacionOrdenCompra.findMany({
        where: { ordenCompraId: { in: [...ordenCompraIds] }, eliminadoEn: null },
        orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }, { id: "desc" }],
      });
      return filas.map((fila) => desdeFila(fila, paso));
    },
  };
}
