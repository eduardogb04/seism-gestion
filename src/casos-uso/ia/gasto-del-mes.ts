/**
 * Gasto de IA del mes contra el tope (F0-28, R10): lo que `/salud` muestra.
 * El panel es F0-26; esta tarea entrega el dato. El mes es el mes civil del
 * reloj inyectado y el gasto, la suma de `uso_ia.costo_usd` de ese mes
 * (la misma cuenta que usa `interpretar` para decidir si llama).
 */
import {
  formatearUsd,
  type MicroUsd,
} from "../../dominio/compartido/micro-usd.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import type { LectorConfiguracion } from "../../puertos/repositorios/configuracion.ts";
import type { RepositorioUsoIa } from "../../puertos/repositorios/uso-ia.ts";
import { leerTope, mesDe } from "./tope.ts";

/** El gasto del mes y el tope, en texto decimal (`"0.0035"`) y en micro-dólares. */
export type GastoDelMes = {
  /** `AAAA-MM`. */
  readonly mes: string;
  readonly gastadoUsd: string;
  readonly gastadoMicroUsd: MicroUsd;
  readonly topeUsd: string;
  readonly topeMicroUsd: MicroUsd;
};

export async function gastoDelMes(
  reloj: Reloj,
  dependencias: {
    readonly usos: RepositorioUsoIa;
    readonly configuracion: LectorConfiguracion;
  },
): Promise<GastoDelMes> {
  const mes = mesDe(reloj.ahora());
  const tope = await leerTope(dependencias.configuracion);
  const gastado = await dependencias.usos.costoEntre(mes.desde, mes.hasta);
  return {
    mes: mes.etiqueta,
    gastadoUsd: formatearUsd(gastado),
    gastadoMicroUsd: gastado,
    topeUsd: formatearUsd(tope),
    topeMicroUsd: tope,
  };
}
