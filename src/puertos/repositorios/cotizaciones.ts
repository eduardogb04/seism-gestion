/**
 * El repositorio de cotizaciones de un servicio (F2-05, ADR 0035): la
 * cabecera; el detalle es su documento. La fila se lee y se escribe como la de
 * cualquier ABM (con su auditoría); lo demás es propio.
 *
 * Implementado con Prisma en `src/adaptadores/prisma/cotizaciones.ts`.
 */

import type { Importe, Moneda } from "../../dominio/compartido/importe.ts";
import type { RegistroDe, RepositorioDe } from "./abm.ts";

export type DatosCotizacion = {
  readonly servicioId: string;
  /** 1 la primera; la numera `siguienteVersion`. */
  readonly version: number;
  /** Un día, `aaaa-mm-dd`. */
  readonly fecha: string;
  readonly importe: Importe<Moneda>;
  /** Por qué se revisó: de la segunda en adelante. */
  readonly motivo: string | null;
  readonly observaciones: string | null;
  readonly documentoId: string;
};

export type Cotizacion = RegistroDe<DatosCotizacion>;

export type RepositorioCotizaciones = Pick<
  RepositorioDe<DatosCotizacion>,
  "buscarPorId" | "crear" | "actualizar"
> & {
  /** Las no anuladas de un servicio, de la versión más nueva a la más vieja. */
  listarDe(servicioId: string): Promise<readonly Cotizacion[]>;
  /** La mayor versión del servicio, también entre las anuladas; 0 si nunca tuvo una. */
  ultimaVersion(servicioId: string): Promise<number>;
  /**
   * La versión que le toca a la próxima: `ultimaVersion` más uno. Primero toma
   * la fila del servicio (`FOR UPDATE`) y la tiene hasta que termine la
   * transacción: dos altas a la vez se turnan, y la segunda ve la versión de la
   * primera.
   */
  siguienteVersion(servicioId: string): Promise<number>;
};
