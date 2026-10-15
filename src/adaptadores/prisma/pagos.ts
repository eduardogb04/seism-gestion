/**
 * Los pagos de egresos con Prisma (F2-09, ADR 0034): el repositorio del molde
 * (`crearRepositorioConConversion`, con su auditoría en la misma transacción)
 * más lo que un pago necesita aparte: bloquear las filas del egreso y de la
 * cuenta, y la consulta de *Por pagar*, con el saldo calculado en la base.
 */

import { z } from "zod";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type {
  DatosPago,
  RepositorioPagos,
} from "../../puertos/repositorios/pagos.ts";
import { aDia, deDia, importeDeColumnas } from "./abm/egresos.ts";
import {
  type Conversion,
  crearRepositorioConConversion,
  enColumna,
} from "./abm/repositorio.ts";
import { type Pago as FilaPago, Prisma } from "./generado/client.ts";

const CONVERSION_PAGO: Conversion<FilaPago, DatosPago> = {
  aDatos({
    fecha,
    importeCentavos,
    importeMoneda,
    salidaCentavos,
    salidaMoneda,
    cambioNumerador,
    cambioDenominador,
    ...resto
  }) {
    return {
      ...resto,
      fecha: aDia(fecha),
      importe: importeDeColumnas(importeCentavos, importeMoneda),
      salida: importeDeColumnas(salidaCentavos, salidaMoneda),
      cambioValor:
        cambioNumerador === null || cambioDenominador === null
          ? null
          : { numerador: cambioNumerador, denominador: cambioDenominador },
    };
  },

  aFila({ fecha, importe, salida, cambioValor, ...resto }) {
    return {
      ...resto,
      fecha: deDia(fecha),
      importeCentavos: importe.centavos,
      importeMoneda: importe.moneda,
      salidaCentavos: salida.centavos,
      salidaMoneda: salida.moneda,
      cambioNumerador: cambioValor?.numerador ?? null,
      cambioDenominador: cambioValor?.denominador ?? null,
    };
  },

  texto: (columna) => (columna === "fecha" ? undefined : columna),

  marcada: (columna) => columna,

  dia: (columna) => (columna === "fecha" ? columna : undefined),

  ordenPor: (columna, sentido) =>
    columna === "importe"
      ? { importeCentavos: sentido }
      : columna === "salida"
        ? { salidaCentavos: sentido }
        : enColumna(columna, sentido),
};

const esquemaFilaPorPagar = z.object({
  id: z.uuid(),
  fecha: z.date(),
  concepto: z.string(),
  centro_costo: z.string(),
  proveedor: z.string().nullable(),
  moneda: z.string(),
  total_centavos: z.bigint(),
  pagado_centavos: z.bigint(),
  saldo_centavos: z.bigint(),
  vencimiento: z.date().nullable(),
});

const esquemaSaldoPorMoneda = z.object({
  moneda: z.string(),
  cantidad: z.bigint(),
  saldo_centavos: z.bigint(),
});

/** Cada egreso vigente con lo que se le pagó (los pagos anulados no cuentan), todo en la base. */
const EGRESOS_CON_PAGADO = Prisma.sql`
  SELECT e.id, e.fecha, e.concepto, cc.nombre AS centro_costo, cl.razon_social AS proveedor,
         e.importe_moneda AS moneda, e.importe_centavos AS total_centavos, e.vencimiento,
         COALESCE((SELECT SUM(p.importe_centavos) FROM pagos p
                    WHERE p.egreso_id = e.id AND p.eliminado_en IS NULL), 0)::bigint AS pagado_centavos
    FROM egresos e
    JOIN centros_costo cc ON cc.id = e.centro_costo_id
    LEFT JOIN clientes cl ON cl.id = e.proveedor_id
   WHERE e.eliminado_en IS NULL`;

function leer<S extends z.ZodType>(esquema: S, filas: unknown): z.output<S>[] {
  const leidas = z.array(esquema).safeParse(filas);
  if (!leidas.success) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "la base devolvió filas de pagos con una forma inválida",
    });
  }
  return leidas.data;
}

export function crearRepositorioPagosPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioPagos {
  return {
    ...crearRepositorioConConversion(
      cliente,
      "Pago",
      cliente.pago,
      CONVERSION_PAGO,
    ),

    async bloquearParaPagar(egresoId, cuentaId) {
      await cliente.$queryRaw`SELECT 1 FROM egresos WHERE id = ${egresoId}::uuid FOR UPDATE`;
      await cliente.$queryRaw`SELECT 1 FROM cuentas WHERE id = ${cuentaId}::uuid FOR SHARE`;
    },

    async porPagar({ incluirPagados, saltear, cantidad }) {
      const conSaldo = Prisma.sql`
        SELECT *, total_centavos - pagado_centavos AS saldo_centavos
          FROM (${EGRESOS_CON_PAGADO}) AS egresos_con_pagado
         WHERE ${incluirPagados} OR total_centavos > pagado_centavos`;
      const filas = leer(
        esquemaFilaPorPagar,
        await cliente.$queryRaw`
          SELECT * FROM (${conSaldo}) AS por_pagar
           ORDER BY vencimiento ASC NULLS LAST, fecha ASC, id ASC
           LIMIT ${cantidad} OFFSET ${saltear}`,
      );
      const porMoneda = leer(
        esquemaSaldoPorMoneda,
        await cliente.$queryRaw`
          SELECT moneda, COUNT(*)::bigint AS cantidad, SUM(saldo_centavos)::bigint AS saldo_centavos
            FROM (${conSaldo}) AS por_pagar
           GROUP BY moneda
           ORDER BY moneda`,
      );
      return {
        filas: filas.map((fila) => ({
          id: fila.id,
          fecha: aDia(fila.fecha),
          concepto: fila.concepto,
          centroCosto: fila.centro_costo,
          proveedor: fila.proveedor,
          total: importeDeColumnas(fila.total_centavos, fila.moneda),
          pagado: importeDeColumnas(fila.pagado_centavos, fila.moneda),
          saldo: importeDeColumnas(fila.saldo_centavos, fila.moneda),
          vencimiento:
            fila.vencimiento === null ? null : aDia(fila.vencimiento),
        })),
        total: porMoneda.reduce(
          (suma, { cantidad }) => suma + Number(cantidad),
          0,
        ),
        saldos: porMoneda.map(({ moneda, saldo_centavos }) =>
          importeDeColumnas(saldo_centavos, moneda),
        ),
      };
    },
  };
}
