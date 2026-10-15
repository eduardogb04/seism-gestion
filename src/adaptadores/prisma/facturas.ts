/**
 * `RepositorioFacturas` con Prisma (F2-06, ADR 0036): la fila se lee y se
 * escribe con lo mismo que la de un ABM (`crearEscrituraPrisma`, con su
 * auditoría); las fechas y el importe pasan como en Egresos.
 */

import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { ALICUOTAS_IVA } from "../../dominio/servicios/factura.ts";
import type {
  DatosFactura,
  RepositorioFacturas,
} from "../../puertos/repositorios/facturas.ts";
import { aDia, deDia, importeDeColumnas } from "./abm/egresos.ts";
import { crearEscrituraPrisma, desdeFila } from "./abm/repositorio.ts";
import type { Factura as FilaFactura, Prisma } from "./generado/client.ts";

type DatosDeFila = Omit<
  FilaFactura,
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
    vencimiento,
    importeCentavos,
    importeMoneda,
    alicuotaIva,
    ...resto
  }: DatosDeFila): DatosFactura {
    const alicuota = ALICUOTAS_IVA.find((valor) => valor === alicuotaIva);
    if (alicuota === undefined) {
      throw nuevoError(catalogo.INF_0001, {
        motivo: "la base devolvió una factura con una alícuota desconocida",
      });
    }
    return {
      ...resto,
      fecha: aDia(fecha),
      vencimiento: aDia(vencimiento),
      importe: importeDeColumnas(importeCentavos, importeMoneda),
      alicuota,
    };
  },

  aFila({
    fecha,
    vencimiento,
    importe,
    alicuota,
    ...resto
  }: DatosFactura): DatosDeFila {
    return {
      ...resto,
      fecha: deDia(fecha),
      vencimiento: deDia(vencimiento),
      importeCentavos: importe.centavos,
      importeMoneda: importe.moneda,
      alicuotaIva: alicuota,
    };
  },
};

/** Un `RepositorioFacturas` en la transacción de `cliente`. */
export function crearRepositorioFacturasPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioFacturas {
  return {
    ...crearEscrituraPrisma<FilaFactura, DatosFactura>(
      cliente,
      "Factura",
      cliente.factura,
      paso,
    ),

    async listarDe(servicioId) {
      const filas = await cliente.factura.findMany({
        where: { servicioId, eliminadoEn: null },
        orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
      });
      return filas.map((fila) => desdeFila(fila, paso));
    },

    async vigentesConServicio() {
      const filas = await cliente.factura.findMany({
        where: { eliminadoEn: null },
        include: {
          servicio: {
            select: {
              codigo: true,
              cliente: { select: { razonSocial: true } },
            },
          },
        },
        orderBy: [{ vencimiento: "asc" }, { numero: "asc" }],
      });
      return filas.map(({ servicio, ...fila }) => ({
        factura: desdeFila(fila, paso),
        servicioCodigo: servicio.codigo,
        cliente: servicio.cliente.razonSocial,
      }));
    },

    async existeNumero(numero) {
      const filas = await cliente.factura.findMany({
        where: {
          eliminadoEn: null,
          numero: { equals: numero, mode: "insensitive" },
        },
        select: { id: true },
        take: 1,
      });
      return filas.length > 0;
    },
  };
}
