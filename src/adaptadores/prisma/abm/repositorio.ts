/**
 * El repositorio de cualquier ABM con Prisma (F1-03, ADR 0031): búsqueda,
 * orden y paginado en la consulta; escritura con su auditoría en la misma
 * transacción.
 *
 * Los delegados de Prisma (`tx.grupo`...) son tipos distintos sin una base
 * común. `TablaAbm<F>` describe lo único que el molde usa de uno, en función
 * de su fila `F`: cada entidad pasa su delegado en `tablas.ts` y el compilador
 * comprueba que encaje, sin `any`.
 */

import { catalogo } from "../../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../../dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../../../dominio/compartido/identificador.ts";
import { formatearISO } from "../../../dominio/compartido/reloj.ts";
import type {
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
type Columna<F> = keyof Datos<F> & string;

type FiltroTexto = {
  mode: "insensitive";
  contains?: string;
  equals?: string;
};

type Donde<F> = {
  eliminadoEn: null;
  OR?: Partial<Record<Columna<F>, FiltroTexto>>[];
};

type Orden<F> = Partial<Record<Columna<F>, "asc" | "desc">> | { id: "asc" };

type ColumnasDeAuditoria = {
  creadoEn: Date;
  creadoPor: Prisma.InputJsonObject;
  actualizadoEn: Date;
  actualizadoPor: Prisma.InputJsonObject;
  eliminadoEn: Date | null;
  eliminadoPor: Prisma.InputJsonObject | typeof Prisma.DbNull;
};

type FilaEscrita<F> = Datos<F> & ColumnasDeAuditoria & { id: string };

export type TablaAbm<F extends FilaAuditable> = {
  findMany(args: {
    where: Donde<F>;
    orderBy: Orden<F>[];
    skip: number;
    take: number;
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
function enColumna<C extends string, V>(
  columna: C,
  valor: V,
): Partial<Record<C, V>> {
  const objeto: Partial<Record<C, V>> = {};
  objeto[columna] = valor;
  return objeto;
}

function desdeFila<F extends FilaAuditable>(fila: F): RegistroDe<Datos<F>> {
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
  const registro: RegistroDe<Datos<F>> = {
    valor: { ...datos, id: identificadorDesde<string>(id) },
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

/** El repositorio de `entidad` sobre su `tabla`, en la transacción de `cliente`. */
export function crearRepositorioAbmPrisma<F extends FilaAuditable>(
  cliente: Prisma.TransactionClient,
  entidad: string,
  tabla: TablaAbm<F>,
): RepositorioDe<Datos<F>> {
  const auditoria = crearAuditoriaPrisma(cliente);
  return {
    async listar({ buscar, enColumnas, orden, direccion, saltear, cantidad }) {
      const where: Donde<F> =
        buscar === ""
          ? { eliminadoEn: null }
          : {
              eliminadoEn: null,
              OR: enColumnas.map((columna) =>
                enColumna(columna, { contains: buscar, mode: "insensitive" }),
              ),
            };
      const filas = await tabla.findMany({
        where,
        // El `id` desempata: sin él, dos filas con el mismo valor pueden cambiar de página.
        orderBy: [enColumna(orden, direccion), { id: "asc" }],
        skip: saltear,
        take: cantidad,
      });
      return {
        registros: filas.map(desdeFila),
        total: await tabla.count({ where }),
      };
    },

    async buscarPorId(id) {
      const fila = await tabla.findUnique({ where: { id } });
      return fila === null ? null : desdeFila(fila);
    },

    async buscarPorValor(columna, valor) {
      const fila = await tabla.findFirst({
        where: {
          eliminadoEn: null,
          OR: [enColumna(columna, { equals: valor, mode: "insensitive" })],
        },
      });
      return fila === null ? null : desdeFila(fila);
    },

    async crear(actor, registro) {
      await escribir(entidad, () =>
        tabla.create({
          data: { ...registro.valor, ...columnasDeAuditoria(registro) },
        }),
      );
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
        tabla.update({
          where: { id },
          data: { ...registro.valor, ...columnasDeAuditoria(registro) },
        }),
      );
      await auditoria.registrar({
        entidad,
        id,
        accion,
        antes: foto(desdeFila(antes)),
        despues: foto(registro),
        actor,
        en: registro.actualizadoEn,
      });
    },
  };
}
