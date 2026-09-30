/**
 * Puerto de la cola de fallidos (F0-25, ADR 0025). *"Nada falla en
 * silencio, y menos la ingesta."* Lo que agotó sus reintentos
 * (`conReintento`, `src/infraestructura/reintento.ts`) queda acá, con su
 * código y lo necesario para volver a intentarlo, hasta que alguien lo
 * resuelve. El panel de salud (F0-26) cuenta los pendientes y lista los más viejos.
 *
 * Implementado en Postgres (`src/adaptadores/prisma/cola-fallidos.ts`, tabla
 * `fallidos`). No hay método para borrar: un fallido se resuelve, no se borra.
 */

import type { Codigo } from "../dominio/compartido/errores/catalogo.ts";

/** Un valor que se puede guardar tal cual en una columna JSON. */
export type ValorJson =
  | string
  | number
  | boolean
  | null
  | readonly ValorJson[]
  | ObjetoJson;

/** Un objeto JSON: la forma de la carga de un fallido. */
export type ObjetoJson = { readonly [clave: string]: ValorJson };

/** Lo que falló después de agotar los reintentos. */
export type Fallo = {
  /** Quién falló: la integración o la operación (por ejemplo, `ingesta.correo`). */
  readonly origen: string;
  /** El código del catálogo del último error. */
  readonly codigoError: Codigo;
  /** Lo necesario para volver a intentarlo. Nunca un secreto: queda en la base. */
  readonly carga: ObjetoJson;
  /** Cuántas veces se intentó antes de encolarlo. */
  readonly intentos: number;
};

/**
 * Lo que el panel de salud muestra de un fallido pendiente. **Sin la
 * `carga`**: es para reintentar a mano y no se muestra en pantalla.
 */
export type FallidoPendiente = {
  /** Identifica al fallido: dos con el mismo origen, código y fecha siguen siendo dos. */
  readonly id: string;
  readonly origen: string;
  readonly codigoError: Codigo;
  readonly creadoEn: Date;
};

export type ColaFallidos = {
  /** Deja el fallo en la cola, pendiente (sin `resuelto_en`). */
  encolar(fallo: Fallo): Promise<void>;
  /** Cuántos fallidos siguen sin resolver. */
  contarPendientes(): Promise<number>;
  /** Hasta `limite` pendientes, del más viejo al más nuevo. */
  listarPendientes(limite: number): Promise<readonly FallidoPendiente[]>;
};
