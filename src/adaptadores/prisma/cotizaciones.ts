/**
 * `RepositorioCotizaciones` con Prisma (F2-05, ADR 0035): la fila se lee y se
 * escribe con lo mismo que la de un ABM (`crearEscrituraPrisma`, con su
 * auditoría); la fecha y el importe pasan como en Egresos.
 */

import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { crearImporte, MONEDAS } from "../../dominio/compartido/importe.ts";
import type {
  DatosCotizacion,
  RepositorioCotizaciones,
} from "../../puertos/repositorios/cotizaciones.ts";
import { aDia, deDia } from "./abm/egresos.ts";
import { crearEscrituraPrisma, desdeFila } from "./abm/repositorio.ts";
import type {
  Cotizacion as FilaCotizacion,
  Prisma,
} from "./generado/client.ts";

type DatosDeFila = Omit<
  FilaCotizacion,
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
  }: DatosDeFila): DatosCotizacion {
    const moneda = MONEDAS.find((codigo) => codigo === importeMoneda);
    if (moneda === undefined) {
      throw nuevoError(catalogo.INF_0001, {
        motivo: "la base devolvió una cotización con una moneda desconocida",
      });
    }
    return {
      ...resto,
      fecha: aDia(fecha),
      importe: crearImporte(importeCentavos, moneda),
    };
  },

  aFila({ fecha, importe, ...resto }: DatosCotizacion): DatosDeFila {
    return {
      ...resto,
      fecha: deDia(fecha),
      importeCentavos: importe.centavos,
      importeMoneda: importe.moneda,
    };
  },
};

/** Un `RepositorioCotizaciones` en la transacción de `cliente`. */
export function crearRepositorioCotizacionesPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioCotizaciones {
  async function ultimaVersion(servicioId: string): Promise<number> {
    const { _max } = await cliente.cotizacion.aggregate({
      where: { servicioId },
      _max: { version: true },
    });
    return _max.version ?? 0;
  }

  return {
    ...crearEscrituraPrisma<FilaCotizacion, DatosCotizacion>(
      cliente,
      "Cotizacion",
      cliente.cotizacion,
      paso,
    ),

    async listarDe(servicioId) {
      const filas = await cliente.cotizacion.findMany({
        where: { servicioId, eliminadoEn: null },
        orderBy: { version: "desc" },
      });
      return filas.map((fila) => desdeFila(fila, paso));
    },

    ultimaVersion,

    async siguienteVersion(servicioId) {
      await cliente.$queryRaw`SELECT 1 FROM "servicios" WHERE "id" = ${servicioId}::uuid FOR UPDATE`;
      return (await ultimaVersion(servicioId)) + 1;
    },
  };
}
