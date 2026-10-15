/**
 * El IVA de una factura tal como se lo muestra a quien la carga (F2-06, ADR
 * 0036). La cuenta es la del dominio: este módulo solo lee lo escrito en el
 * formulario y da formato. Lo importa la pantalla en el navegador, así que no
 * puede traer nada de servidor.
 */

import { formatearImporte } from "../../dominio/compartido/importe.ts";
import {
  ALICUOTAS_IVA,
  type AlicuotaIva,
  ivaDe,
  totalConIva,
} from "../../dominio/servicios/factura.ts";
import { type Escrito, leerImporte } from "../abm/definicion.ts";

/** `210` es «21 %», `105` es «10,5 %». */
export function etiquetaDeAlicuota(alicuota: AlicuotaIva): string {
  return `${String(alicuota / 10).replace(".", ",")} %`;
}

/** La lista del selector de alícuota: el valor es la alícuota en milésimas. */
export const OPCIONES_DE_ALICUOTA = ALICUOTAS_IVA.map((alicuota) => ({
  valor: String(alicuota),
  etiqueta: etiquetaDeAlicuota(alicuota),
}));

/** El IVA y el total de lo escrito (`importe`, su moneda y `alicuota`), o `null` si todavía no se puede calcular. */
export function ivaYTotalEscritos(
  escrito: Escrito,
): { readonly iva: string; readonly total: string } | null {
  const importe = leerImporte("importe", escrito);
  const alicuota = ALICUOTAS_IVA.find(
    (valor) => String(valor) === escrito.alicuota,
  );
  if ("error" in importe || alicuota === undefined) {
    return null;
  }
  return {
    iva: formatearImporte(ivaDe(importe.valor, alicuota)),
    total: formatearImporte(totalConIva(importe.valor, alicuota)),
  };
}
