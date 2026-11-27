/**
 * `RepositorioOrdenesCompra` con Prisma (F2-06, ADR 0036): la fila se lee y se
 * escribe con lo mismo que la de un ABM (`crearEscrituraPrisma`, con su
 * auditoría); la fecha y el importe pasan como en Egresos.
 */

import type {
  DatosOrdenCompra,
  RepositorioOrdenesCompra,
} from "../../puertos/repositorios/ordenes-de-compra.ts";
import {
  aDia,
  cambioDeColumnas,
  columnasDeCambio,
  deDia,
  importeDeColumnas,
} from "./abm/egresos.ts";
import { crearEscrituraPrisma, desdeFila } from "./abm/repositorio.ts";
import { aFechaHora, aInstante } from "./conversiones.ts";
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
    cambioNumerador,
    cambioDenominador,
    cambioFuente,
    reemplazadaEn,
    ...resto
  }: DatosDeFila): DatosOrdenCompra {
    return {
      ...resto,
      fecha: aDia(fecha),
      importe: importeDeColumnas(importeCentavos, importeMoneda),
      cambio: cambioDeColumnas(
        cambioNumerador,
        cambioDenominador,
        cambioFuente,
      ),
      reemplazadaEn: reemplazadaEn === null ? null : aFechaHora(reemplazadaEn),
    };
  },

  aFila({
    fecha,
    importe,
    cambio,
    reemplazadaEn,
    ...resto
  }: DatosOrdenCompra): DatosDeFila {
    return {
      ...resto,
      reemplazadaEn: reemplazadaEn === null ? null : aInstante(reemplazadaEn),
      fecha: deDia(fecha),
      importeCentavos: importe.centavos,
      importeMoneda: importe.moneda,
      ...columnasDeCambio(cambio),
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

    async vigenteDe(servicioId) {
      const fila = await cliente.ordenCompra.findFirst({
        where: { servicioId, eliminadoEn: null, reemplazadaEn: null },
        orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }, { id: "desc" }],
      });
      return fila === null ? undefined : desdeFila(fila, paso);
    },
  };
}
