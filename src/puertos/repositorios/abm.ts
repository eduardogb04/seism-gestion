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
import type { Importe, Moneda } from "../../dominio/compartido/importe.ts";

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
  readonly Camion: {
    readonly clienteId: string;
    readonly tipo: string;
    readonly patenteTractor: string;
    readonly marcaTractor: string;
    readonly anioTractor: number;
    readonly patenteCisterna: string | null;
    readonly marcaCisterna: string | null;
    readonly anioCisterna: number | null;
    readonly capacidadLitros: number;
    readonly observaciones: string | null;
  };
  readonly TipoServicio: {
    readonly nombre: string;
    readonly descripcion: string | null;
    readonly modalidad: string;
    readonly activo: boolean;
  };
  readonly Cuenta: {
    readonly nombre: string;
    readonly tipo: string;
    readonly moneda: string;
    readonly observaciones: string | null;
    readonly activa: boolean;
  };
  readonly CentroCosto: {
    readonly nombre: string;
    readonly clase: string;
    readonly descripcion: string | null;
    readonly activo: boolean;
  };
  readonly Egreso: {
    /** Un día, `aaaa-mm-dd`: sin hora ni zona. */
    readonly fecha: string;
    readonly concepto: string;
    readonly centroCostoId: string;
    readonly proveedorId: string | null;
    readonly numeroComprobante: string | null;
    readonly importe: Importe<Moneda>;
    readonly vencimiento: string | null;
    readonly observaciones: string | null;
  };
};

export type EntidadAbm = keyof EntidadesAbm;
export type DatosAbm<E extends EntidadAbm> = EntidadesAbm[E];

/** Las columnas de texto de `D`: por las únicas se busca, se ordena y se compara. */
export type ColumnaDeTexto<D> = {
  [C in keyof D & string]: D[C] extends string | null ? C : never;
}[keyof D & string];

/** Las columnas de `D` con una casilla de sí/no: también se filtra por ellas. */
export type ColumnaDeSiNo<D> = {
  [C in keyof D & string]: D[C] extends boolean ? C : never;
}[keyof D & string];

/** Las columnas de `D` que guardan un importe: se ordena por sus centavos. */
export type ColumnaDeImporte<D> = {
  [C in keyof D & string]: D[C] extends Importe<Moneda> ? C : never;
}[keyof D & string];

/** Por cuáles se puede ordenar un listado. */
export type ColumnaDeOrden<D> = ColumnaDeTexto<D> | ColumnaDeImporte<D>;

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
  /** Solo los que tienen exactamente ese valor en cada columna (un id). */
  readonly filtros: readonly {
    readonly columna: ColumnaDeTexto<D>;
    readonly igual: string;
  }[];
  /** Solo los que tienen la casilla marcada en cada una de estas columnas. */
  readonly marcadas: readonly ColumnaDeSiNo<D>[];
  /** Solo los de un mes (`aaaa-mm`) de una columna de día. Ninguno no filtra. */
  readonly mes: {
    readonly columna: ColumnaDeTexto<D>;
    readonly mes: string;
  } | null;
  readonly orden: ColumnaDeOrden<D>;
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
  /** Los meses (`aaaa-mm`) de los no eliminados en una columna de día, del más nuevo al más viejo. */
  mesesCon(columna: ColumnaDeTexto<D>): Promise<readonly string[]>;
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
