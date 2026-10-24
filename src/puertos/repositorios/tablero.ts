/**
 * Las consultas de agregación del tablero (F2-10, ADR 0038): todas de lectura,
 * y las sumas las hace la base. Cada monto vuelve en su moneda, sin convertir
 * ni mezclar.
 *
 * Implementado con Prisma en `src/adaptadores/prisma/tablero.ts`.
 */

import type { Importe, Moneda } from "../../dominio/compartido/importe.ts";
import type { AlicuotaIva } from "../../dominio/servicios/factura.ts";

/** Un tramo de días: `desde` incluido, `hasta` excluido, ambos `aaaa-mm-dd`. */
export type Rango = {
  readonly desde: string;
  readonly hasta: string;
};

export type ClaseDeCentro =
  | "proyecto"
  | "gestion_administrativa"
  | "fuera_de_rentabilidad";

/** Las facturas vigentes de una misma moneda, alícuota e importe sin IVA. */
export type FacturasIguales = {
  /** El importe sin IVA de cada una. */
  readonly importe: Importe<Moneda>;
  readonly alicuota: AlicuotaIva;
  readonly cantidad: number;
  /** La suma de esos importes: la hace la base. */
  readonly suma: Importe<Moneda>;
};

export type EgresosDeUnCentro = {
  readonly centroId: string;
  readonly centro: string;
  readonly clase: ClaseDeCentro;
  readonly total: Importe<Moneda>;
};

export type RentabilidadDeServicio = {
  readonly servicioId: string;
  readonly codigo: string;
  readonly titulo: string;
  /** Sin IVA, desde siempre. */
  readonly facturado: Importe<Moneda>;
  /** Los egresos de centros de proyecto imputados al servicio, en la misma moneda. */
  readonly egresos: Importe<Moneda>;
};

export type FacturaDeLaLista = {
  readonly id: string;
  readonly servicioId: string;
  readonly servicio: string;
  readonly numero: string;
  /** `aaaa-mm-dd`. */
  readonly fecha: string;
  /** Sin IVA. */
  readonly importe: Importe<Moneda>;
  readonly alicuota: AlicuotaIva;
};

export type CobroDeLaLista = {
  readonly servicioId: string;
  readonly factura: string;
  /** `aaaa-mm-dd`. */
  readonly fecha: string;
  readonly importe: Importe<Moneda>;
  readonly retencion: Importe<Moneda> | null;
};

export type PagoDeLaLista = {
  readonly egresoId: string;
  readonly concepto: string;
  /** `aaaa-mm-dd`. */
  readonly fecha: string;
  readonly importe: Importe<Moneda>;
};

export type RepositorioTablero = {
  /** Las facturas vigentes con fecha en el rango, agrupadas. */
  facturasDelRango(rango: Rango): Promise<readonly FacturasIguales[]>;
  /** Cobros vigentes con fecha en el rango: importe más retención, un total por moneda. */
  cobradoEnElRango(rango: Rango): Promise<readonly Importe<Moneda>[]>;
  /** Pagos vigentes con fecha en el rango, un total por moneda. */
  pagadoEnElRango(rango: Rango): Promise<readonly Importe<Moneda>[]>;
  /** Egresos vigentes con fecha en el rango, un total por moneda y centro de costo. */
  egresosPorCentro(rango: Rango): Promise<readonly EgresosDeUnCentro[]>;
  /** Una fila por servicio y moneda con facturas o con egresos de proyecto; por código. */
  rentabilidadPorServicio(): Promise<readonly RentabilidadDeServicio[]>;
  /** Las facturas que suma `facturasDelRango`, de esa moneda, por fecha y número. */
  facturasDeLaLista(
    rango: Rango,
    moneda: Moneda,
  ): Promise<readonly FacturaDeLaLista[]>;
  /** Los cobros que suma `cobradoEnElRango`, de esa moneda, por fecha. */
  cobrosDeLaLista(
    rango: Rango,
    moneda: Moneda,
  ): Promise<readonly CobroDeLaLista[]>;
  /** Los pagos que suma `pagadoEnElRango`, de esa moneda, por fecha. */
  pagosDeLaLista(
    rango: Rango,
    moneda: Moneda,
  ): Promise<readonly PagoDeLaLista[]>;
};
