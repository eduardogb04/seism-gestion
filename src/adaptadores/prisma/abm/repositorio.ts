/**
 * El repositorio de cualquier ABM con Prisma (F1-03, ADR 0031): búsqueda,
 * orden y paginado en la consulta; escritura con su auditoría en la misma
 * transacción.
 *
 * Los delegados de Prisma (`tx.grupo`...) son tipos distintos sin una base
 * común. `TablaAbm<F>` describe lo único que el molde usa de uno, en función
 * de su fila `F`: cada entidad pasa su delegado en `tablas.ts` y el compilador
 * comprueba que encaje, sin `any`.
 *
 * Si los datos de la entidad no son los de su fila (una fecha es `Date` en la
 * base y `aaaa-mm-dd` en los datos; un importe son dos columnas), la entidad
 * pasa además su `Conversion` (F2-03, ADR 0032).
 */

import { catalogo } from "../../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../../dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../../../dominio/compartido/identificador.ts";
import { formatearISO } from "../../../dominio/compartido/reloj.ts";
import type {
  ColumnaDeOrden,
  ColumnaDeSiNo,
  ColumnaDeTexto,
  RegistroDe,
  RepositorioDe,
} from "../../../puertos/repositorios/abm.ts";
import { crearAuditoriaPrisma } from "../auditoria.ts";
import {
  actorAJson,
  actorDesdeJson,
  aFechaHora,
  aInstante,
} from "../conversiones.ts";
import { Prisma } from "../generado/client.ts";

/** Código de Prisma para una violación de índice único. */
const VIOLACION_UNICO = "P2002";

/** Las columnas que toda tabla de ABM lleva además de sus datos (las de `usuarios`). */
type FilaAuditable = {
  id: string;
  creadoEn: Date;
  creadoPor: Prisma.JsonValue;
  actualizadoEn: Date;
  actualizadoPor: Prisma.JsonValue;
  eliminadoEn: Date | null;
  eliminadoPor: Prisma.JsonValue | null;
};

type Datos<F> = Omit<F, keyof FilaAuditable>;
type Columna<F> = ColumnaDeTexto<Datos<F>>;
type ColumnaMarcada<F> = ColumnaDeSiNo<Datos<F>>;
type ColumnaDia<F> = {
  [C in keyof Datos<F> & string]: Datos<F>[C] extends Date | null ? C : never;
}[keyof Datos<F> & string];
type ColumnaGrande<F> = {
  [C in keyof Datos<F> & string]: Datos<F>[C] extends bigint | null ? C : never;
}[keyof Datos<F> & string];

type FiltroTexto = {
  mode?: "insensitive";
  contains?: string;
  equals?: string;
};

type Donde<F> = {
  eliminadoEn?: null;
  id?: { in: string[] };
  OR?: Partial<Record<Columna<F>, FiltroTexto>>[];
  AND?: (
    | Partial<Record<Columna<F>, FiltroTexto>>
    | Partial<Record<ColumnaMarcada<F>, { equals: true }>>
    | Partial<Record<ColumnaDia<F>, { gte: Date; lt: Date }>>
  )[];
};

type Sentido = "asc" | "desc";

type Orden<F> =
  | Partial<Record<Columna<F>, Sentido>>
  | Partial<Record<ColumnaDia<F>, Sentido>>
  | Partial<Record<ColumnaGrande<F>, Sentido>>
  | { id: "asc" };

const MARCADA: { equals: true } = { equals: true };

type ColumnasDeAuditoria = {
  creadoEn: Date;
  creadoPor: Prisma.InputJsonObject;
  actualizadoEn: Date;
  actualizadoPor: Prisma.InputJsonObject;
  eliminadoEn: Date | null;
  eliminadoPor: Prisma.InputJsonObject | typeof Prisma.DbNull;
};

type FilaEscrita<F> = Datos<F> & ColumnasDeAuditoria & { id: string };

type TablaAbm<F extends FilaAuditable> = {
  findMany(args: {
    where: Donde<F>;
    orderBy?: Orden<F>[];
    distinct?: ColumnaDia<F>[];
    skip?: number;
    take?: number;
  }): Promise<F[]>;
  count(args: { where: Donde<F> }): Promise<number>;
  findFirst(args: { where: Donde<F> }): Promise<F | null>;
  findUnique(args: { where: { id: string } }): Promise<F | null>;
  create(args: { data: FilaEscrita<F> }): Promise<unknown>;
  update(args: {
    where: { id: string };
    data: FilaEscrita<F>;
  }): Promise<unknown>;
};

/** `{ [columna]: valor }` sin perder el tipo de la clave (un literal con clave calculada lo ensancha a `string`). */
export function enColumna<C extends string, V>(
  columna: C,
  valor: V,
): Partial<Record<C, V>> {
  const objeto: Partial<Record<C, V>> = {};
  objeto[columna] = valor;
  return objeto;
}

/** Cómo pasan los datos de una entidad entre su fila y el dominio. */
type Paso<F extends FilaAuditable, D> = {
  aDatos(fila: Datos<F>): D;
  aFila(datos: D): Datos<F>;
};

/**
 * El `Paso` y cómo se consulta por columnas de los datos, para las entidades que
 * tienen fechas o importes. Los miembros son métodos (no propiedades de
 * función) a propósito: `sinConversion` los declara con columnas de texto nada más.
 */
export type Conversion<F extends FilaAuditable, D> = Paso<F, D> & {
  /** La columna de la fila donde se busca o filtra por texto una de los datos (un día no es de texto). */
  texto(columna: ColumnaDeTexto<D>): Columna<F> | undefined;
  marcada(columna: ColumnaDeSiNo<D>): ColumnaMarcada<F>;
  /** La columna de día de la fila que corresponde a una de los datos. */
  dia(columna: ColumnaDeTexto<D>): ColumnaDia<F> | undefined;
  /** Cómo se ordena la fila por una columna de los datos (un importe, por sus centavos). */
  ordenPor(columna: ColumnaDeOrden<D>, sentido: Sentido): Orden<F>;
};

/** Los datos de la entidad son los de su fila. */
function sinConversion<F extends FilaAuditable>(): Conversion<F, Datos<F>> {
  return {
    aDatos: (fila) => fila,
    aFila: (datos) => datos,
    texto: (columna) => columna,
    marcada: (columna) => columna,
    dia: () => undefined,
    ordenPor: (columna: Columna<F>, sentido) => enColumna(columna, sentido),
  };
}

function desdeFila<F extends FilaAuditable, D>(
  fila: F,
  conversion: Paso<F, D>,
): RegistroDe<D> {
  const {
    id,
    creadoEn,
    creadoPor,
    actualizadoEn,
    actualizadoPor,
    eliminadoEn,
    eliminadoPor,
    ...datos
  } = fila;
  const registro: RegistroDe<D> = {
    valor: { ...conversion.aDatos(datos), id: identificadorDesde<string>(id) },
    creadoEn: aFechaHora(creadoEn),
    creadoPor: actorDesdeJson(creadoPor),
    actualizadoEn: aFechaHora(actualizadoEn),
    actualizadoPor: actorDesdeJson(actualizadoPor),
  };
  if (eliminadoEn === null || eliminadoPor === null) {
    return registro;
  }
  return {
    ...registro,
    eliminadoEn: aFechaHora(eliminadoEn),
    eliminadoPor: actorDesdeJson(eliminadoPor),
  };
}

function columnasDeAuditoria<D>(registro: RegistroDe<D>): ColumnasDeAuditoria {
  return {
    creadoEn: aInstante(registro.creadoEn),
    creadoPor: actorAJson(registro.creadoPor),
    actualizadoEn: aInstante(registro.actualizadoEn),
    actualizadoPor: actorAJson(registro.actualizadoPor),
    eliminadoEn:
      registro.eliminadoEn === undefined
        ? null
        : aInstante(registro.eliminadoEn),
    eliminadoPor:
      registro.eliminadoPor === undefined
        ? Prisma.DbNull
        : actorAJson(registro.eliminadoPor),
  };
}

/** Lo que la auditoría guarda en `antes` y `despues`: los datos y, si está de baja, desde cuándo. */
function foto<D>(registro: RegistroDe<D>): Readonly<Record<string, unknown>> {
  return registro.eliminadoEn === undefined
    ? registro.valor
    : { ...registro.valor, eliminadoEn: formatearISO(registro.eliminadoEn) };
}

/** Desde el primer día del mes (`aaaa-mm`) hasta el primero del siguiente, sin incluirlo. */
function rangoDelMes(mes: string): { gte: Date; lt: Date } {
  const [anio = 0, numero = 1] = mes.split("-").map(Number);
  return {
    gte: new Date(Date.UTC(anio, numero - 1, 1)),
    lt: new Date(Date.UTC(anio, numero, 1)),
  };
}

/** Corre una escritura; si la base rechaza un valor único repetido, `DOM-0008`. */
async function escribir(
  entidad: string,
  escritura: () => Promise<unknown>,
): Promise<void> {
  try {
    await escritura();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === VIOLACION_UNICO
    ) {
      throw nuevoError(catalogo.DOM_0008, { entidad }, error);
    }
    throw error;
  }
}

/**
 * Leer uno y escribir con su auditoría: lo que no depende de cómo se consulta.
 * Lo usa también una entidad que no es un ABM pero se guarda igual (Servicio, F2-04).
 */
export function crearEscrituraPrisma<F extends FilaAuditable, D>(
  cliente: Prisma.TransactionClient,
  entidad: string,
  tabla: Pick<TablaAbm<F>, "findUnique" | "create" | "update">,
  paso: Paso<F, D>,
): Pick<RepositorioDe<D>, "buscarPorId" | "crear" | "actualizar"> {
  const auditoria = crearAuditoriaPrisma(cliente);
  const aRegistro = (fila: F) => desdeFila(fila, paso);
  const aFila = (registro: RegistroDe<D>) => ({
    ...paso.aFila(registro.valor),
    id: registro.valor.id,
    ...columnasDeAuditoria(registro),
  });
  return {
    async buscarPorId(id) {
      const fila = await tabla.findUnique({ where: { id } });
      return fila === null ? null : aRegistro(fila);
    },

    async crear(actor, registro) {
      await escribir(entidad, () => tabla.create({ data: aFila(registro) }));
      await auditoria.registrar({
        entidad,
        id: registro.valor.id,
        accion: "crear",
        antes: null,
        despues: foto(registro),
        actor,
        en: registro.creadoEn,
      });
    },

    async actualizar(actor, registro, accion) {
      const { id } = registro.valor;
      const antes = await tabla.findUnique({ where: { id } });
      if (antes === null) {
        throw nuevoError(catalogo.DOM_0009, { entidad, id });
      }
      await escribir(entidad, () =>
        tabla.update({ where: { id }, data: aFila(registro) }),
      );
      await auditoria.registrar({
        entidad,
        id,
        accion,
        antes: foto(aRegistro(antes)),
        despues: foto(registro),
        actor,
        en: registro.actualizadoEn,
      });
    },
  };
}

/** El repositorio de `entidad` sobre su `tabla`, en la transacción de `cliente`. */
export function crearRepositorioAbmPrisma<F extends FilaAuditable>(
  cliente: Prisma.TransactionClient,
  entidad: string,
  tabla: TablaAbm<F>,
): RepositorioDe<Datos<F>> {
  return crearRepositorioConConversion(
    cliente,
    entidad,
    tabla,
    sinConversion<F>(),
  );
}

/** El de una entidad cuyos datos no son los de su fila. */
export function crearRepositorioConConversion<F extends FilaAuditable, D>(
  cliente: Prisma.TransactionClient,
  entidad: string,
  tabla: TablaAbm<F>,
  conversion: Conversion<F, D>,
): RepositorioDe<D> {
  const aRegistro = (fila: F) => desdeFila(fila, conversion);
  return {
    ...crearEscrituraPrisma(cliente, entidad, tabla, conversion),

    async listar({
      buscaEn,
      filtros,
      marcadas,
      mes,
      orden,
      direccion,
      saltear,
      cantidad,
    }) {
      const dia = mes === null ? undefined : conversion.dia(mes.columna);
      const where: Donde<F> = {
        eliminadoEn: null,
        ...(buscaEn.length === 0
          ? {}
          : {
              OR: buscaEn.flatMap(({ columna, texto }) => {
                const enFila = conversion.texto(columna);
                return enFila === undefined
                  ? []
                  : [
                      enColumna(enFila, {
                        contains: texto,
                        mode: "insensitive",
                      }),
                    ];
              }),
            }),
        AND: [
          ...filtros.flatMap(({ columna, igual }) => {
            const enFila = conversion.texto(columna);
            return enFila === undefined
              ? []
              : [enColumna(enFila, { equals: igual })];
          }),
          ...marcadas.map((columna) =>
            enColumna(conversion.marcada(columna), MARCADA),
          ),
          ...(mes === null || dia === undefined
            ? []
            : [enColumna(dia, rangoDelMes(mes.mes))]),
        ],
      };
      const filas = await tabla.findMany({
        where,
        // El `id` desempata: sin él, dos filas con el mismo valor pueden cambiar de página.
        orderBy: [conversion.ordenPor(orden, direccion), { id: "asc" }],
        skip: saltear,
        take: cantidad,
      });
      return {
        registros: filas.map(aRegistro),
        total: await tabla.count({ where }),
      };
    },

    async mesesCon(columna) {
      const dia = conversion.dia(columna);
      if (dia === undefined) {
        return [];
      }
      const filas = await tabla.findMany({
        where: { eliminadoEn: null },
        distinct: [dia],
        orderBy: [enColumna(dia, "desc")],
      });
      const meses = new Set<string>();
      for (const { valor } of filas.map(aRegistro)) {
        const texto = valor[columna];
        if (typeof texto === "string") {
          meses.add(texto.slice(0, 7));
        }
      }
      return [...meses];
    },

    async buscarPorIds(ids) {
      const filas = await tabla.findMany({ where: { id: { in: [...ids] } } });
      return filas.map(aRegistro);
    },

    async buscarPorValores(valores) {
      const fila = await tabla.findFirst({
        where: {
          eliminadoEn: null,
          AND: valores.flatMap(({ columna, valor, exacto }) => {
            const enFila = conversion.texto(columna);
            return enFila === undefined
              ? []
              : [
                  enColumna(
                    enFila,
                    exacto
                      ? { equals: valor }
                      : { equals: valor, mode: "insensitive" },
                  ),
                ];
          }),
        },
      });
      return fila === null ? null : aRegistro(fila);
    },

    async hayVigenteCon(columna, valor) {
      const enFila = conversion.texto(columna);
      if (enFila === undefined) {
        return false;
      }
      const fila = await tabla.findFirst({
        where: {
          eliminadoEn: null,
          OR: [enColumna(enFila, { equals: valor })],
        },
      });
      return fila !== null;
    },
  };
}
