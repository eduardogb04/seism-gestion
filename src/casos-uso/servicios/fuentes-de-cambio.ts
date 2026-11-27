/**
 * Las fuentes del tipo de cambio que se trae solo al cargar una factura en
 * dólares (los textos que quedan anotados como fuente del comprobante) y la
 * que queda si se lo escribe a mano.
 */

export const FUENTES_DE_CAMBIO = {
  billete: "Oficial vendedor (BNA billete)",
  divisa: "Divisa vendedor (BNA)",
} as const;

export type FuenteDeCambio = keyof typeof FUENTES_DE_CAMBIO;

export const FUENTE_MANUAL = "Manual";
