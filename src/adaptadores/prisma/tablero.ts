/**
 * Las consultas del tablero con Prisma (F2-10, ADR 0038). Todo `$queryRaw`
 * tipado con Zod en el borde: las sumas las hace PostgreSQL, y cada consulta
 * de una lista usa **las mismas condiciones** que la suma a la que lleva.
 */

import { z } from "zod";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type { ValorTipoDeCambio } from "../../dominio/compartido/importe.ts";
import { ALICUOTAS_IVA } from "../../dominio/servicios/factura.ts";
import type { MontoParaConvertir } from "../../dominio/tablero/conversion.ts";
import type { RepositorioTablero } from "../../puertos/repositorios/tablero.ts";
import { aDia, importeDeColumnas } from "./abm/egresos.ts";
import { Prisma } from "./generado/client.ts";

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

const montoConCambio = {
  moneda: z.string(),
  importe_centavos: z.bigint(),
  numerador: z.bigint().nullable(),
  denominador: z.bigint().nullable(),
  cantidad: z.number(),
};

const esquemaMontoConCambio = z.object(montoConCambio);

const esquemaMontoDeUnMes = z.object({ ...montoConCambio, mes: z.string() });

const esquemaEgresoDeUnMes = z.object({
  ...montoConCambio,
  mes: z.string(),
  clase,
});

const esquemaMontoDeUnServicio = z.object({
  ...montoConCambio,
  servicio_id: z.uuid(),
  codigo: z.string(),
});

const esquemaCambioDeUnDocumento = z.object({
  id: z.uuid(),
  numerador: z.bigint().nullable(),
  denominador: z.bigint().nullable(),
});

const esquemaDocumentoSinCambio = z.object({
  tipo: z.enum(["factura", "egreso"]),
  id: z.uuid(),
  servicio_id: z.uuid().nullable(),
  numero: z.string(),
  fecha: z.date(),
  moneda: z.string(),
  importe_centavos: z.bigint(),
});

/**
 * El tipo de cambio (pesos por dólar) que le toca a cada factura y egreso, como
 * `cambio_de_documento(id, numerador, denominador)`: el propio si es en
 * dólares y el más reciente cargado en un documento en dólares con fecha
 * igual o anterior si es en pesos (ADR 0042). Un tipo de cambio de cero o
 * negativo no cuenta. Las consultas de abajo lo anteponen y lo juntan por `id`.
 */
const CAMBIO_DE_CADA_DOCUMENTO = Prisma.sql`
  WITH cambios_en_dolares AS (
    SELECT fecha, creado_en, id, cambio_numerador AS numerador, cambio_denominador AS denominador
      FROM ordenes_de_compra
     WHERE eliminado_en IS NULL AND importe_moneda = 'USD' AND cambio_numerador > 0 AND cambio_denominador > 0
    UNION ALL
    SELECT fecha, creado_en, id, cambio_numerador, cambio_denominador
      FROM facturas
     WHERE eliminado_en IS NULL AND importe_moneda = 'USD' AND cambio_numerador > 0 AND cambio_denominador > 0
    UNION ALL
    SELECT fecha, creado_en, id, cambio_numerador, cambio_denominador
      FROM egresos
     WHERE eliminado_en IS NULL AND importe_moneda = 'USD' AND cambio_numerador > 0 AND cambio_denominador > 0
    UNION ALL
    SELECT fecha, creado_en, id, cambio_numerador, cambio_denominador
      FROM cobros
     WHERE eliminado_en IS NULL AND importe_moneda = 'USD' AND cambio_numerador > 0 AND cambio_denominador > 0
    UNION ALL
    SELECT fecha, creado_en, id, cambio_numerador, cambio_denominador
      FROM pagos
     WHERE eliminado_en IS NULL AND importe_moneda = 'USD' AND cambio_numerador > 0 AND cambio_denominador > 0
  ), cambio_de_documento AS (
    SELECT d.id,
           CASE WHEN d.importe_moneda = 'USD' THEN d.numerador ELSE u.numerador END AS numerador,
           CASE WHEN d.importe_moneda = 'USD' THEN d.denominador ELSE u.denominador END AS denominador
      FROM (
        SELECT id, fecha, importe_moneda,
               CASE WHEN cambio_numerador > 0 AND cambio_denominador > 0 THEN cambio_numerador END AS numerador,
               CASE WHEN cambio_numerador > 0 AND cambio_denominador > 0 THEN cambio_denominador END AS denominador
          FROM facturas
        UNION ALL
        SELECT id, fecha, importe_moneda,
               CASE WHEN cambio_numerador > 0 AND cambio_denominador > 0 THEN cambio_numerador END,
               CASE WHEN cambio_numerador > 0 AND cambio_denominador > 0 THEN cambio_denominador END
          FROM egresos
      ) d
      LEFT JOIN LATERAL (
        SELECT c.numerador, c.denominador
          FROM cambios_en_dolares c
         WHERE c.fecha <= d.fecha
         ORDER BY c.fecha DESC, c.creado_en DESC, c.id DESC
         LIMIT 1
      ) u ON d.importe_moneda <> 'USD'
  )`;

function cambioDe(fila: {
  readonly numerador: bigint | null;
  readonly denominador: bigint | null;
}): ValorTipoDeCambio | null {
  return fila.numerador === null || fila.denominador === null
    ? null
    : { numerador: fila.numerador, denominador: fila.denominador };
}

function montoDe(
  fila: z.output<typeof esquemaMontoConCambio>,
): MontoParaConvertir {
  return {
    importe: importeDeColumnas(fila.importe_centavos, fila.moneda),
    cambio: cambioDe(fila),
    cantidad: fila.cantidad,
  };
}

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

    async facturadoPorMes({ desde, hasta }) {
      const filas = leer(
        esquemaMontoDeUnMes,
        await cliente.$queryRaw`
          ${CAMBIO_DE_CADA_DOCUMENTO}
          SELECT to_char(f.fecha, 'YYYY-MM') AS mes, f.importe_moneda AS moneda, f.importe_centavos,
                 d.numerador, d.denominador, COUNT(*)::int AS cantidad
            FROM facturas f
            JOIN cambio_de_documento d ON d.id = f.id
           WHERE f.eliminado_en IS NULL AND f.fecha >= ${desde}::date AND f.fecha < ${hasta}::date
           GROUP BY 1, 2, 3, 4, 5
           ORDER BY 1, 2, 3, 4, 5`,
      );
      return filas.map((fila) => ({ mes: fila.mes, ...montoDe(fila) }));
    },

    async egresosPorMes({ desde, hasta }) {
      const filas = leer(
        esquemaEgresoDeUnMes,
        await cliente.$queryRaw`
          ${CAMBIO_DE_CADA_DOCUMENTO}
          SELECT to_char(e.fecha, 'YYYY-MM') AS mes, cc.clase, e.importe_moneda AS moneda, e.importe_centavos,
                 d.numerador, d.denominador, COUNT(*)::int AS cantidad
            FROM egresos e
            JOIN centros_costo cc ON cc.id = e.centro_costo_id
            JOIN cambio_de_documento d ON d.id = e.id
           WHERE e.eliminado_en IS NULL AND e.fecha >= ${desde}::date AND e.fecha < ${hasta}::date
           GROUP BY 1, 2, 3, 4, 5, 6
           ORDER BY 1, 2, 3, 4, 5, 6`,
      );
      return filas.map((fila) => ({
        mes: fila.mes,
        clase: fila.clase,
        ...montoDe(fila),
      }));
    },

    async cobradoConCambio({ desde, hasta }) {
      const filas = leer(
        esquemaMontoConCambio,
        await cliente.$queryRaw`
          ${CAMBIO_DE_CADA_DOCUMENTO}
          SELECT c.importe_moneda AS moneda,
                 (c.importe_centavos + COALESCE(c.retencion_centavos, 0))::bigint AS importe_centavos,
                 d.numerador, d.denominador, COUNT(*)::int AS cantidad
            FROM cobros c
            JOIN cambio_de_documento d ON d.id = c.factura_id
           WHERE c.eliminado_en IS NULL AND c.fecha >= ${desde}::date AND c.fecha < ${hasta}::date
           GROUP BY 1, 2, 3, 4
           ORDER BY 1, 2, 3, 4`,
      );
      return filas.map(montoDe);
    },

    async pagadoConCambio({ desde, hasta }) {
      const filas = leer(
        esquemaMontoConCambio,
        await cliente.$queryRaw`
          ${CAMBIO_DE_CADA_DOCUMENTO}
          SELECT p.importe_moneda AS moneda, p.importe_centavos,
                 d.numerador, d.denominador, COUNT(*)::int AS cantidad
            FROM pagos p
            JOIN cambio_de_documento d ON d.id = p.egreso_id
           WHERE p.eliminado_en IS NULL AND p.fecha >= ${desde}::date AND p.fecha < ${hasta}::date
           GROUP BY 1, 2, 3, 4
           ORDER BY 1, 2, 3, 4`,
      );
      return filas.map(montoDe);
    },

    async rentabilidadConCambio() {
      const facturado = leer(
        esquemaMontoDeUnServicio,
        await cliente.$queryRaw`
          ${CAMBIO_DE_CADA_DOCUMENTO}
          SELECT s.id AS servicio_id, s.codigo, f.importe_moneda AS moneda, f.importe_centavos,
                 d.numerador, d.denominador, COUNT(*)::int AS cantidad
            FROM facturas f
            JOIN servicios s ON s.id = f.servicio_id
            JOIN cambio_de_documento d ON d.id = f.id
           WHERE f.eliminado_en IS NULL AND s.eliminado_en IS NULL
           GROUP BY 1, 2, 3, 4, 5, 6
           ORDER BY 2, 3, 4, 5, 6`,
      );
      const egresos = leer(
        esquemaMontoDeUnServicio,
        await cliente.$queryRaw`
          ${CAMBIO_DE_CADA_DOCUMENTO}
          SELECT s.id AS servicio_id, s.codigo, e.importe_moneda AS moneda, e.importe_centavos,
                 d.numerador, d.denominador, COUNT(*)::int AS cantidad
            FROM egresos e
            JOIN centros_costo cc ON cc.id = e.centro_costo_id
            JOIN servicios s ON s.id = e.servicio_id
            JOIN cambio_de_documento d ON d.id = e.id
           WHERE e.eliminado_en IS NULL AND s.eliminado_en IS NULL AND cc.clase = 'proyecto'
           GROUP BY 1, 2, 3, 4, 5, 6
           ORDER BY 2, 3, 4, 5, 6`,
      );
      const aMonto = (fila: z.output<typeof esquemaMontoDeUnServicio>) => ({
        servicioId: fila.servicio_id,
        codigo: fila.codigo,
        ...montoDe(fila),
      });
      return { facturado: facturado.map(aMonto), egresos: egresos.map(aMonto) };
    },

    async cambiosDe(ids) {
      const filas = leer(
        esquemaCambioDeUnDocumento,
        await cliente.$queryRaw`
          ${CAMBIO_DE_CADA_DOCUMENTO}
          SELECT id, numerador, denominador
            FROM cambio_de_documento
           WHERE id = ANY(${[...ids]}::uuid[])`,
      );
      return filas.map((fila) => ({ id: fila.id, cambio: cambioDe(fila) }));
    },

    async documentosSinCambio(moneda) {
      const filas = leer(
        esquemaDocumentoSinCambio,
        await cliente.$queryRaw`
          ${CAMBIO_DE_CADA_DOCUMENTO}
          SELECT 'factura' AS tipo, f.id, f.servicio_id, f.numero, f.fecha,
                 f.importe_moneda AS moneda, f.importe_centavos
            FROM facturas f
            JOIN cambio_de_documento d ON d.id = f.id
           WHERE f.eliminado_en IS NULL AND f.importe_moneda <> ${moneda} AND d.numerador IS NULL
          UNION ALL
          SELECT 'egreso', e.id, NULL::uuid, COALESCE(e.numero_comprobante, e.concepto), e.fecha,
                 e.importe_moneda, e.importe_centavos
            FROM egresos e
            JOIN cambio_de_documento d ON d.id = e.id
           WHERE e.eliminado_en IS NULL AND e.importe_moneda <> ${moneda} AND d.numerador IS NULL
          ORDER BY fecha, numero, id`,
      );
      return filas.map((fila) => ({
        tipo: fila.tipo,
        id: fila.id,
        servicioId: fila.servicio_id,
        numero: fila.numero,
        fecha: aDia(fila.fecha),
        importe: importeDeColumnas(fila.importe_centavos, fila.moneda),
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
