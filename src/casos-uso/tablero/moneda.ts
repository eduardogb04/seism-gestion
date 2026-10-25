/** La moneda en que se mira el tablero: `?moneda=ARS|USD`, y pesos si no viene o no es una. */

import { z } from "zod";
import { MONEDAS, type Moneda } from "../../dominio/compartido/importe.ts";

const esquemaMoneda = z.enum(MONEDAS).catch("ARS");

export function elegirMoneda(pedida: unknown): Moneda {
  return esquemaMoneda.parse(pedida);
}
