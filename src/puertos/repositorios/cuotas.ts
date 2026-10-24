/**
 * La cuota mensual de un servicio y sus ajustes (F3-03, ADR 0041): solo se
 * agregan; cambiar de modalidad las da de baja (baja lógica). La fila se lee y
 * se escribe como la de cualquier ABM (con su auditoría).
 *
 * Implementado con Prisma en `src/adaptadores/prisma/cuotas.ts`.
 */

import type { Importe, Moneda } from "../../dominio/compartido/importe.ts";
import type { RegistroDe, RepositorioDe } from "./abm.ts";

export type DatosCuota = {
  readonly servicioId: string;
  /** El orden de carga en el servicio, contando también las dadas de baja: entre dos del mismo mes vale la última. */
  readonly posicion: number;
  /** El mes desde el que rige, como su día 1: `aaaa-mm-01`. */
  readonly desdeMes: string;
  /** Sin IVA, en la moneda de la orden de compra. */
  readonly importe: Importe<Moneda>;
};

export type CuotaGuardada = RegistroDe<DatosCuota>;

export type RepositorioCuotas = Pick<
  RepositorioDe<DatosCuota>,
  "crear" | "actualizar"
> & {
  /** Las vigentes de un servicio, en el orden en que se cargaron. */
  listarDe(servicioId: string): Promise<readonly CuotaGuardada[]>;
  /** Cuántas se le cargaron al servicio, también las dadas de baja: la próxima `posicion`. */
  cantidadDe(servicioId: string): Promise<number>;
};
