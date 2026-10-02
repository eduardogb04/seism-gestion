/**
 * El repositorio de servicios (F2-04, ADR 0033). No es un ABM del molde: su
 * código lo genera el sistema, su estado es un historial de eventos y abarca
 * un conjunto de sitios. La fila se lee y se escribe como la de cualquier ABM
 * (`RepositorioDe`, con su auditoría); lo demás es propio.
 *
 * Los eventos solo se agregan. El conjunto de sitios se reemplaza entero y
 * cómo cambió queda en `auditoria`.
 *
 * Implementado con Prisma en `src/adaptadores/prisma/servicios.ts`.
 */

import type { Actor } from "../../dominio/compartido/actor.ts";
import type { FechaHora } from "../../dominio/compartido/reloj.ts";
import type {
  EstadoServicio,
  EventoServicio,
} from "../../dominio/servicios/estados.ts";
import type { EntidadAbm, RegistroDe, RepositorioDe } from "./abm.ts";

export type DatosServicio = {
  /** `SRV-2026-014`: lo genera el sistema al crear y no cambia. */
  readonly codigo: string;
  readonly clienteId: string;
  readonly tipoServicioId: string;
  readonly titulo: string;
  readonly modalidad: string;
  readonly responsableId: string;
  /** Un día, `aaaa-mm-dd`, como las vigencias. */
  readonly fechaPedido: string;
  readonly vigenciaDesde: string | null;
  readonly vigenciaHasta: string | null;
  readonly observaciones: string | null;
};

export type Servicio = RegistroDe<DatosServicio>;

export const ORDENES_DE_SERVICIOS = ["fechaPedido", "codigo"] as const;

/** Un servicio como se ve en el listado: con lo que se muestra de lo que referencia. */
export type FilaDeServicio = {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly cliente: string;
  readonly tipo: string;
  readonly estado: EstadoServicio;
  /** El email. */
  readonly responsable: string;
  readonly fechaPedido: string;
};

export type ConsultaDeServicios = {
  /** Contiene, sin distinguir mayúsculas, en el código, el título o la razón social del cliente. Vacío no filtra. */
  readonly buscar: string;
  readonly estado: EstadoServicio | null;
  readonly clienteId: string | null;
  readonly orden: (typeof ORDENES_DE_SERVICIOS)[number];
  readonly direccion: "asc" | "desc";
  readonly saltear: number;
  readonly cantidad: number;
};

export type RepositorioServicios = Pick<
  RepositorioDe<DatosServicio>,
  "buscarPorId" | "crear" | "actualizar"
> & {
  /** Los no eliminados que cumplen la consulta, y cuántos son sin paginar. */
  listar(consulta: ConsultaDeServicios): Promise<{
    readonly filas: readonly FilaDeServicio[];
    readonly total: number;
  }>;
  /** Los cambios de estado, del primero (el alta) al último (el estado actual). */
  eventosDe(id: string): Promise<readonly EventoServicio[]>;
  /**
   * Agrega el evento en esa `posicion`. Si ya hay uno ahí (otro cambio entró
   * primero), lanza `DOM-0011` y no guarda nada.
   */
  agregarEvento(
    actor: Actor,
    id: string,
    cambio: Omit<EventoServicio, "actor"> & { readonly posicion: number },
  ): Promise<void>;
  /** Los ids de los sitios que abarca. */
  sitiosDe(id: string): Promise<readonly string[]>;
  /** Reemplaza el conjunto de sitios y deja en `auditoria` el de antes y el de después. */
  guardarSitios(
    actor: Actor,
    id: string,
    sitioIds: readonly string[],
    en: FechaHora,
  ): Promise<void>;
  /** ¿Hay algún servicio no eliminado que use ese registro (su cliente, su tipo, uno de sus sitios)? */
  usa(entidad: EntidadAbm, id: string): Promise<boolean>;
};
