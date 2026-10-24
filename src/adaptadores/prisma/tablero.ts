/**
 * Las consultas del tablero con Prisma (F2-10, ADR 0038). Todo `$queryRaw`
 * tipado con Zod en el borde: las sumas las hace PostgreSQL, y cada consulta
 * de una lista usa **las mismas condiciones** que la suma a la que lleva.
 */

import { z } from "zod";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { ALICUOTAS_IVA } from "../../dominio/servicios/factura.ts";
import type { RepositorioTablero } from "../../puertos/repositorios/tablero.ts";
import { aDia, importeDeColumnas } from "./abm/egresos.ts";
import type { Prisma } from "./generado/client.ts";

const alicuota = z.literal(ALICUOTAS_IVA);
const clase = z.enum([
  "proyecto",
  "gestion_administrativa",
  "fuera_de_rentabilidad",
]);

const esquemaFacturasIguales = z.object({
  moneda: z.string(),
  alicuota,
  importe_centavos: z.bigint(),
  cantidad: z.number(),
  suma_centavos: z.bigint(),
});

const esquemaTotalPorMoneda = z.object({
  moneda: z.string(),
  total_centavos: z.bigint(),
});

const esquemaEgresosDeUnCentro = z.object({
  moneda: z.string(),
  centro_id: z.uuid(),
  centro: z.string(),
  clase,
  total_centavos: z.bigint(),
});

const esquemaRentabilidad = z.object({
  servicio_id: z.uuid(),
  codigo: z.string(),
  titulo: z.string(),
  moneda: z.string(),
  facturado_centavos: z.bigint(),
  egresos_centavos: z.bigint(),
});

const esquemaFacturaDeLaLista = z.object({
  id: z.uuid(),
  servicio_id: z.uuid(),
  servicio: z.string(),
  numero: z.string(),
  fecha: z.date(),
  moneda: z.string(),
  importe_centavos: z.bigint(),
  alicuota,
});

const esquemaCobroDeLaLista = z.object({
  servicio_id: z.uuid(),
  factura: z.string(),
  fecha: z.date(),
  moneda: z.string(),
  importe_centavos: z.bigint(),
  retencion_centavos: z.bigint().nullable(),
});

const esquemaPagoDeLaLista = z.object({
  egreso_id: z.uuid(),
  concepto: z.string(),
  fecha: z.date(),
  moneda: z.string(),
  importe_centavos: z.bigint(),
});

function leer<S extends z.ZodType>(esquema: S, filas: unknown): z.output<S>[] {
  const leidas = z.array(esquema).safeParse(filas);
  if (!leidas.success) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "la base devolvió filas del tablero con una forma inválida",
    });
  }
  return leidas.data;
}

/** Un `RepositorioTablero` en la transacción de `cliente`. */
export function crearRepositorioTableroPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioTablero {
  return {
    async facturasDelRango({ desde, hasta }) {
      const filas = leer(
        esquemaFacturasIguales,
        await cliente.$queryRaw`
          SELECT importe_moneda AS moneda, alicuota_iva AS alicuota, importe_centavos,
                 COUNT(*)::int AS cantidad, SUM(importe_centavos)::bigint AS suma_centavos
            FROM facturas
           WHERE eliminado_en IS NULL AND fecha >= ${desde}::date AND fecha < ${hasta}::date
           GROUP BY importe_moneda, alicuota_iva, importe_centavos
           ORDER BY importe_moneda, alicuota_iva, importe_centavos`,
      );
      return filas.map((fila) => ({
        importe: importeDeColumnas(fila.importe_centavos, fila.moneda),
        alicuota: fila.alicuota,
        cantidad: fila.cantidad,
        suma: importeDeColumnas(fila.suma_centavos, fila.moneda),
      }));
    },

    async cobradoEnElRango({ desde, hasta }) {
      const filas = leer(
        esquemaTotalPorMoneda,
        await cliente.$queryRaw`
          SELECT importe_moneda AS moneda,
                 SUM(importe_centavos + COALESCE(retencion_centavos, 0))::bigint AS total_centavos
            FROM cobros
           WHERE eliminado_en IS NULL AND fecha >= ${desde}::date AND fecha < ${hasta}::date
           GROUP BY importe_moneda
           ORDER BY importe_moneda`,
      );
      return filas.map((fila) =>
        importeDeColumnas(fila.total_centavos, fila.moneda),
      );
    },

    async pagadoEnElRango({ desde, hasta }) {
      const filas = leer(
        esquemaTotalPorMoneda,
        await cliente.$queryRaw`
          SELECT importe_moneda AS moneda, SUM(importe_centavos)::bigint AS total_centavos
            FROM pagos
           WHERE eliminado_en IS NULL AND fecha >= ${desde}::date AND fecha < ${hasta}::date
           GROUP BY importe_moneda
           ORDER BY importe_moneda`,
      );
      return filas.map((fila) =>
        importeDeColumnas(fila.total_centavos, fila.moneda),
      );
    },

    async egresosPorCentro({ desde, hasta }) {
      const filas = leer(
        esquemaEgresosDeUnCentro,
        await cliente.$queryRaw`
          SELECT e.importe_moneda AS moneda, cc.id AS centro_id, cc.nombre AS centro, cc.clase,
                 SUM(e.importe_centavos)::bigint AS total_centavos
            FROM egresos e
            JOIN centros_costo cc ON cc.id = e.centro_costo_id
           WHERE e.eliminado_en IS NULL AND e.fecha >= ${desde}::date AND e.fecha < ${hasta}::date
           GROUP BY e.importe_moneda, cc.id, cc.nombre, cc.clase
           ORDER BY e.importe_moneda, cc.nombre, cc.id`,
      );
      return filas.map((fila) => ({
        centroId: fila.centro_id,
        centro: fila.centro,
        clase: fila.clase,
        total: importeDeColumnas(fila.total_centavos, fila.moneda),
      }));
    },

    async rentabilidadPorServicio() {
      const filas = leer(
        esquemaRentabilidad,
        await cliente.$queryRaw`
          WITH facturado AS (
            SELECT servicio_id, importe_moneda AS moneda, SUM(importe_centavos)::bigint AS centavos
              FROM facturas
             WHERE eliminado_en IS NULL
             GROUP BY servicio_id, importe_moneda
          ), gastado AS (
            SELECT e.servicio_id, e.importe_moneda AS moneda, SUM(e.importe_centavos)::bigint AS centavos
              FROM egresos e
              JOIN centros_costo cc ON cc.id = e.centro_costo_id
             WHERE e.eliminado_en IS NULL AND e.servicio_id IS NOT NULL AND cc.clase = 'proyecto'
             GROUP BY e.servicio_id, e.importe_moneda
          )
          SELECT s.id AS servicio_id, s.codigo, s.titulo,
                 COALESCE(f.moneda, g.moneda) AS moneda,
                 COALESCE(f.centavos, 0)::bigint AS facturado_centavos,
                 COALESCE(g.centavos, 0)::bigint AS egresos_centavos
            FROM facturado f
            FULL JOIN gastado g ON g.servicio_id = f.servicio_id AND g.moneda = f.moneda
            JOIN servicios s ON s.id = COALESCE(f.servicio_id, g.servicio_id)
           WHERE s.eliminado_en IS NULL
           ORDER BY s.codigo, COALESCE(f.moneda, g.moneda)`,
      );
      return filas.map((fila) => ({
        servicioId: fila.servicio_id,
        codigo: fila.codigo,
        titulo: fila.titulo,
        facturado: importeDeColumnas(fila.facturado_centavos, fila.moneda),
        egresos: importeDeColumnas(fila.egresos_centavos, fila.moneda),
      }));
    },

    async facturasDeLaLista({ desde, hasta }, monedaElegida) {
      const filas = leer(
        esquemaFacturaDeLaLista,
        await cliente.$queryRaw`
          SELECT f.id, s.id AS servicio_id, s.codigo AS servicio, f.numero, f.fecha,
                 f.importe_moneda AS moneda, f.importe_centavos, f.alicuota_iva AS alicuota
            FROM facturas f
            JOIN servicios s ON s.id = f.servicio_id
           WHERE f.eliminado_en IS NULL AND f.fecha >= ${desde}::date AND f.fecha < ${hasta}::date
             AND f.importe_moneda = ${monedaElegida}
           ORDER BY f.fecha, f.numero, f.id`,
      );
      return filas.map((fila) => ({
        id: fila.id,
        servicioId: fila.servicio_id,
        servicio: fila.servicio,
        numero: fila.numero,
        fecha: aDia(fila.fecha),
        importe: importeDeColumnas(fila.importe_centavos, fila.moneda),
        alicuota: fila.alicuota,
      }));
    },

    async cobrosDeLaLista({ desde, hasta }, monedaElegida) {
      const filas = leer(
        esquemaCobroDeLaLista,
        await cliente.$queryRaw`
          SELECT f.servicio_id, f.numero AS factura, c.fecha, c.importe_moneda AS moneda,
                 c.importe_centavos, c.retencion_centavos
            FROM cobros c
            JOIN facturas f ON f.id = c.factura_id
           WHERE c.eliminado_en IS NULL AND c.fecha >= ${desde}::date AND c.fecha < ${hasta}::date
             AND c.importe_moneda = ${monedaElegida}
           ORDER BY c.fecha, f.numero, c.id`,
      );
      return filas.map((fila) => ({
        servicioId: fila.servicio_id,
        factura: fila.factura,
        fecha: aDia(fila.fecha),
        importe: importeDeColumnas(fila.importe_centavos, fila.moneda),
        retencion:
          fila.retencion_centavos === null
            ? null
            : importeDeColumnas(fila.retencion_centavos, fila.moneda),
      }));
    },

    async pagosDeLaLista({ desde, hasta }, monedaElegida) {
      const filas = leer(
        esquemaPagoDeLaLista,
        await cliente.$queryRaw`
          SELECT e.id AS egreso_id, e.concepto, p.fecha, p.importe_moneda AS moneda, p.importe_centavos
            FROM pagos p
            JOIN egresos e ON e.id = p.egreso_id
           WHERE p.eliminado_en IS NULL AND p.fecha >= ${desde}::date AND p.fecha < ${hasta}::date
             AND p.importe_moneda = ${monedaElegida}
           ORDER BY p.fecha, e.concepto, p.id`,
      );
      return filas.map((fila) => ({
        egresoId: fila.egreso_id,
        concepto: fila.concepto,
        fecha: aDia(fila.fecha),
        importe: importeDeColumnas(fila.importe_centavos, fila.moneda),
      }));
    },
  };
}
