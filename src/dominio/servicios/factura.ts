/**
 * El IVA de una factura (F2-06, ADR 0036): se carga el importe sin IVA y el IVA
 * y el total se calculan siempre, acá, y nunca se guardan: no pueden quedar
 * desparejos de la alícuota. El redondeo es el del dominio (`importe.ts`):
 * al centavo, la mitad hacia arriba.
 */

import {
  crearImporte,
  type Importe,
  type Moneda,
  redondearMitadLejosDelCero,
} from "../compartido/importe.ts";

/** Las alícuotas que se ofrecen, en milésimas: 210 es el 21 %, 105 el 10,5 %. */
export const ALICUOTAS_IVA = [210, 105, 0] as const;

export type AlicuotaIva = (typeof ALICUOTAS_IVA)[number];

export const ALICUOTA_POR_DEFECTO: AlicuotaIva = 210;

/** El IVA de `base` (sin IVA) a esa alícuota, en su misma moneda. */
export function ivaDe<M extends Moneda>(
  base: Importe<M>,
  alicuota: AlicuotaIva,
): Importe<M> {
  return crearImporte(
    redondearMitadLejosDelCero(base.centavos * BigInt(alicuota), 1000n),
    base.moneda,
  );
}

/** La base más su IVA: la suma exacta, sin un segundo redondeo. */
export function totalConIva<M extends Moneda>(
  base: Importe<M>,
  alicuota: AlicuotaIva,
): Importe<M> {
  return crearImporte(
    base.centavos + ivaDe(base, alicuota).centavos,
    base.moneda,
  );
}
