/**
 * El puerto genérico de los ABM (F1-03, ADR 0031): un solo repositorio para
 * todas las entidades de catálogo, que `RepositoriosEnTransaccion.abm` entrega
 * por entidad. Un ABM nuevo suma **una entrada** a `EntidadesAbm` con la forma
 * de sus datos; no suma un puerto.
 *
 * Como en usuarios (ADR 0029), `crear` y `actualizar` reciben el `Actor` y el
 * adaptador deja la auditoría en la misma transacción. No hay borrado: dar de
 * baja es `actualizar` un registro que ya trae `eliminadoEn`.
 *
 * Implementado con Prisma en `src/adaptadores/prisma/abm/`.
 */

import type { Actor } from "../../dominio/compartido/actor.ts";
import type {
  AccionAuditoria,
  Auditable,
} from "../../dominio/compartido/auditable.ts";
import type { Identificador } from "../../dominio/compartido/identificador.ts";

/** Los datos de cada entidad con ABM, sin el `id` ni la auditoría. */
type EntidadesAbm = {
  readonly Grupo: {
    readonly nombre: string;
    readonly observaciones: string | null;
  };
  readonly Cliente: {
    readonly razonSocial: string;
    readonly cuit: string;
    readonly condicionIva: string;
    readonly domicilio: string;
    readonly localidad: string;
    readonly provincia: string;
    readonly codigoPostal: string;
    readonly esCliente: boolean;
    readonly esProveedor: boolean;
    readonly nombreCorto: string | null;
    readonly grupoId: string | null;
    readonly contactoNombre: string | null;
    readonly contactoTelefono: string | null;
    readonly contactoEmail: string | null;
    readonly emailFacturacion: string | null;
    readonly observaciones: string | null;
  };
  readonly Sitio: {
    readonly clienteId: string;
    readonly nombre: string;
    readonly provincia: string;
    readonly localidad: string;
    readonly direccion: string | null;
    readonly latitud: number | null;
    readonly longitud: number | null;
    readonly cantidadTanques: number;
    readonly capacidadTotalLitros: number;
    readonly observaciones: string | null;
  };
};

export type EntidadAbm = keyof EntidadesAbm;
export type DatosAbm<E extends EntidadAbm> = EntidadesAbm[E];

/** Las columnas de texto de `D`: por las únicas se busca, se ordena y se compara. */
export type ColumnaDeTexto<D> = {
  [C in keyof D & string]: D[C] extends string | null ? C : never;
}[keyof D & string];

/** Datos `D` con su `id` y quién y cuándo los creó, cambió y dio de baja. */
export type RegistroDe<D> = Auditable<
  D & { readonly id: Identificador<string> }
>;

type ConsultaDe<D> = {
  /** Qué se busca en cada columna: contiene, sin distinguir mayúsculas. Ninguna no filtra. */
  readonly buscaEn: readonly {
    readonly columna: ColumnaDeTexto<D>;
    readonly texto: string;
  }[];
  readonly orden: ColumnaDeTexto<D>;
  readonly direccion: "asc" | "desc";
  readonly saltear: number;
  readonly cantidad: number;
};

export type RepositorioDe<D> = {
  /** Los no eliminados que cumplen la consulta, y cuántos son sin paginar. */
  listar(consulta: ConsultaDe<D>): Promise<{
    readonly registros: readonly RegistroDe<D>[];
    readonly total: number;
  }>;
  /** También devuelve uno eliminado: quien llama decide qué hacer con él. */
  buscarPorId(id: string): Promise<RegistroDe<D> | null>;
  /** Los que existen de esos ids, también los eliminados, en una sola consulta. */
  buscarPorIds(ids: readonly string[]): Promise<readonly RegistroDe<D>[]>;
  /**
   * El no eliminado que tiene **todos** esos valores, sin distinguir
   * mayúsculas salvo en los `exacto` (un id no es un texto).
   */
  buscarPorValores(
    valores: readonly {
      readonly columna: ColumnaDeTexto<D>;
      readonly valor: string;
      readonly exacto: boolean;
    }[],
  ): Promise<RegistroDe<D> | null>;
  /** ¿Hay algún no eliminado con exactamente ese valor en `columna`? */
  hayVigenteCon(columna: ColumnaDeTexto<D>, valor: string): Promise<boolean>;
  /**
   * Guarda un registro nuevo y su auditoría (`crear`, sin `antes`). Si la base
   * rechaza un valor único repetido, lanza `DOM-0008` y no guarda nada.
   */
  crear(actor: Actor, registro: RegistroDe<D>): Promise<void>;
  /**
   * Reemplaza un registro que ya existe y deja la auditoría con `accion`, lo
   * que estaba guardado y lo que queda. `DOM-0008` si repite un valor único.
   */
  actualizar(
    actor: Actor,
    registro: RegistroDe<D>,
    accion: AccionAuditoria,
  ): Promise<void>;
};

export type RegistroAbm<E extends EntidadAbm> = RegistroDe<DatosAbm<E>>;
export type RepositorioAbm<E extends EntidadAbm> = RepositorioDe<DatosAbm<E>>;
