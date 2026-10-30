/**
 * `RepositorioFacturas` con Prisma (F2-06, ADR 0036): la fila se lee y se
 * escribe con lo mismo que la de un ABM (`crearEscrituraPrisma`, con su
 * auditoría); las fechas y el importe pasan como en Egresos.
 */

import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { TIPOS_DE_COMPROBANTE } from "../../dominio/servicios/comprobante.ts";
import { ALICUOTAS_IVA } from "../../dominio/servicios/factura.ts";
import type {
  DatosFactura,
  RepositorioFacturas,
} from "../../puertos/repositorios/facturas.ts";
import {
  aDia,
  cambioDeColumnas,
  columnasDeCambio,
  deDia,
  importeDeColumnas,
} from "./abm/egresos.ts";
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
    cambioNumerador,
    cambioDenominador,
    cambioFuente,
    alicuotaIva,
    periodo,
    tipo: tipoGuardado,
    ...resto
  }: DatosDeFila): DatosFactura {
    const alicuota = ALICUOTAS_IVA.find((valor) => valor === alicuotaIva);
    const tipo = TIPOS_DE_COMPROBANTE.find((valor) => valor === tipoGuardado);
    if (alicuota === undefined || tipo === undefined) {
      throw nuevoError(catalogo.INF_0001, {
        motivo:
          "la base devolvió una factura con una alícuota o un tipo desconocido",
      });
    }
    return {
      ...resto,
      fecha: aDia(fecha),
      vencimiento: aDia(vencimiento),
      importe: importeDeColumnas(importeCentavos, importeMoneda),
      cambio: cambioDeColumnas(
        cambioNumerador,
        cambioDenominador,
        cambioFuente,
      ),
      alicuota,
      periodo: periodo === null ? null : aDia(periodo),
      tipo,
    };
  },

  aFila({
    fecha,
    vencimiento,
    importe,
    cambio,
    alicuota,
    periodo,
    ...resto
  }: DatosFactura): DatosDeFila {
    return {
      ...resto,
      fecha: deDia(fecha),
      vencimiento: deDia(vencimiento),
      importeCentavos: importe.centavos,
      importeMoneda: importe.moneda,
      ...columnasDeCambio(cambio),
      alicuotaIva: alicuota,
      periodo: periodo === null ? null : deDia(periodo),
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
        orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }, { numero: "desc" }],
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

    async existeNumero(numero, tipo) {
      const filas = await cliente.factura.findMany({
        where: {
          eliminadoEn: null,
          tipo,
          numero: { equals: numero, mode: "insensitive" },
        },
        select: { id: true },
        take: 1,
      });
      return filas.length > 0;
    },
  };
}
