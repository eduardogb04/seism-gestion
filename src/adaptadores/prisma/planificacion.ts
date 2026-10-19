/**
 * `RepositorioHitos` y `RepositorioRecursos` con Prisma (F3-02): la fila se lee
 * y se escribe con lo mismo que la de un ABM (`crearEscrituraPrisma`, con su
 * auditoría); los días pasan como en Egresos.
 */

import type {
  DatosHito,
  DatosRecurso,
  RepositorioHitos,
  RepositorioRecursos,
} from "../../puertos/repositorios/planificacion.ts";
import { aDia, deDia } from "./abm/egresos.ts";
import { crearEscrituraPrisma, desdeFila } from "./abm/repositorio.ts";
import { actorAJson, actorDesdeJson } from "./conversiones.ts";
import {
  type ServicioHito as FilaHito,
  type ServicioRecurso as FilaRecurso,
  Prisma,
} from "./generado/client.ts";

type Auditoria =
  | "id"
  | "creadoEn"
  | "creadoPor"
  | "actualizadoEn"
  | "actualizadoPor"
  | "eliminadoEn"
  | "eliminadoPor";

function diaONada(fecha: Date | null): string | null {
  return fecha === null ? null : aDia(fecha);
}

function fechaONada(dia: string | null): Date | null {
  return dia === null ? null : deDia(dia);
}

const pasoDeHito = {
  aDatos({
    realizadoEn,
    realizadoPor,
    ...resto
  }: Omit<FilaHito, Auditoria>): DatosHito {
    return {
      ...resto,
      realizadoEn: diaONada(realizadoEn),
      realizadoPor: realizadoPor === null ? null : actorDesdeJson(realizadoPor),
    };
  },

  aFila({
    realizadoEn,
    realizadoPor,
    ...resto
  }: DatosHito): Omit<FilaHito, Auditoria> {
    return {
      ...resto,
      realizadoEn: fechaONada(realizadoEn),
      realizadoPor: realizadoPor === null ? null : actorAJson(realizadoPor),
    };
  },
};

const pasoDeRecurso = {
  aDatos({
    desde,
    hasta,
    ...resto
  }: Omit<FilaRecurso, Auditoria>): DatosRecurso {
    return { ...resto, desde: diaONada(desde), hasta: diaONada(hasta) };
  },

  aFila({
    desde,
    hasta,
    ...resto
  }: DatosRecurso): Omit<FilaRecurso, Auditoria> {
    return { ...resto, desde: fechaONada(desde), hasta: fechaONada(hasta) };
  },
};

/** Un `RepositorioHitos` en la transacción de `cliente`. */
export function crearRepositorioHitosPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioHitos {
  return {
    ...crearEscrituraPrisma<FilaHito, DatosHito>(
      cliente,
      "ServicioHito",
      {
        findUnique: (args) => cliente.servicioHito.findUnique(args),
        // Prisma pide `DbNull`, no `null`, para una columna `jsonb` vacía.
        create: ({ data }) =>
          cliente.servicioHito.create({
            data: { ...data, realizadoPor: data.realizadoPor ?? Prisma.DbNull },
          }),
        update: ({ where, data }) =>
          cliente.servicioHito.update({
            where,
            data: { ...data, realizadoPor: data.realizadoPor ?? Prisma.DbNull },
          }),
      },
      pasoDeHito,
    ),

    async listarDe(servicioId) {
      const filas = await cliente.servicioHito.findMany({
        where: { servicioId, eliminadoEn: null },
        orderBy: [{ orden: "asc" }, { creadoEn: "asc" }],
      });
      return filas.map((fila) => desdeFila(fila, pasoDeHito));
    },
  };
}

/** Un `RepositorioRecursos` en la transacción de `cliente`. */
export function crearRepositorioRecursosPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioRecursos {
  return {
    ...crearEscrituraPrisma<FilaRecurso, DatosRecurso>(
      cliente,
      "ServicioRecurso",
      cliente.servicioRecurso,
      pasoDeRecurso,
    ),

    async listarDe(servicioId) {
      const filas = await cliente.servicioRecurso.findMany({
        where: { servicioId, eliminadoEn: null },
        orderBy: { creadoEn: "asc" },
      });
      return filas.map((fila) => desdeFila(fila, pasoDeRecurso));
    },
  };
}
