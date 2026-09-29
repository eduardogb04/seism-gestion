/**
 * Traducciones entre el dominio y las columnas de Postgres (F0-30, ADR 0024),
 * compartidas por los adaptadores de usuarios, sesiones y auditoría.
 *
 * - **Fechas.** `FechaHora` es una fecha civil sin zona (ADR 0012): la
 *   operación es argentina. Se guarda en `timestamptz` como el instante que
 *   esa fecha civil es en la Argentina, con desplazamiento fijo `-03:00` (el
 *   país no tiene horario de verano). La vuelta resta las tres horas y lee la
 *   fecha civil: ida y vuelta dan la misma `FechaHora`, sin depender de la
 *   zona de la máquina.
 * - **Actor.** Se guarda como `jsonb` (`{ tipo, usuarioId }` o
 *   `{ tipo, proceso }`) y se valida con Zod al leerlo: lo que viene de la
 *   base es un borde.
 * - **JSON.** `antes`/`despues` de la auditoría pasan a un valor JSON de
 *   Prisma; un valor que JSON no representa es un error del sistema.
 */

import { z } from "zod";
import {
  type Actor,
  crearNombreProceso,
} from "../../dominio/compartido/actor.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../../dominio/compartido/identificador.ts";
import {
  type FechaHora,
  formatearISO,
  parsearISO,
} from "../../dominio/compartido/reloj.ts";
import type { Prisma } from "./generado/client.ts";

/** Desplazamiento de la Argentina respecto de UTC, fijo (sin horario de verano). */
const DESPLAZAMIENTO_ARGENTINA = "-03:00";
const MILISEGUNDOS_DESPLAZAMIENTO = -3 * 60 * 60 * 1000;

/** La fecha civil argentina como instante, para una columna `timestamptz`. */
export function aInstante(fechaHora: FechaHora): Date {
  return new Date(`${formatearISO(fechaHora)}${DESPLAZAMIENTO_ARGENTINA}`);
}

/** La vuelta de `aInstante`: el instante leído de la base, como fecha civil argentina. */
export function aFechaHora(instante: Date): FechaHora {
  const civil = new Date(instante.getTime() + MILISEGUNDOS_DESPLAZAMIENTO)
    .toISOString()
    .slice(0, 23);
  const resultado = parsearISO(civil);
  if (!resultado.ok) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "la base devolvió una fecha que no es una FechaHora válida",
      mensaje: resultado.mensaje,
    });
  }
  return resultado.fechaHora;
}

const esquemaActor = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("persona"), usuarioId: z.string().min(1) }),
  z.object({ tipo: z.literal("sistema"), proceso: z.string() }),
]);

/** Un `Actor` como objeto JSON para una columna `jsonb`. */
export function actorAJson(actor: Actor): Prisma.InputJsonObject {
  return actor.tipo === "persona"
    ? { tipo: actor.tipo, usuarioId: actor.usuarioId }
    : { tipo: actor.tipo, proceso: actor.proceso };
}

/** Lee un `Actor` de una columna `jsonb`, validando su forma. */
export function actorDesdeJson(valor: Prisma.JsonValue): Actor {
  const leido = esquemaActor.safeParse(valor);
  if (!leido.success) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "la base devolvió un actor con una forma inválida",
    });
  }
  if (leido.data.tipo === "persona") {
    return {
      tipo: "persona",
      usuarioId: identificadorDesde<"Usuario">(leido.data.usuarioId),
    };
  }
  const proceso = crearNombreProceso(leido.data.proceso);
  if (!proceso.ok) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "la base devolvió un actor de sistema con un nombre inválido",
    });
  }
  return { tipo: "sistema", proceso: proceso.valor };
}

function aJsonAnidado(valor: unknown): Prisma.InputJsonValue | null {
  if (valor === null) {
    return null;
  }
  if (
    typeof valor === "string" ||
    typeof valor === "boolean" ||
    (typeof valor === "number" && Number.isFinite(valor))
  ) {
    return valor;
  }
  if (Array.isArray(valor)) {
    return valor.map(aJsonAnidado);
  }
  if (typeof valor === "object") {
    return aJsonObjeto(valor);
  }
  throw nuevoError(catalogo.INF_0001, {
    motivo: "un valor de la auditoría no se puede guardar como JSON",
    tipo: typeof valor,
  });
}

/** Un objeto como JSON de Prisma. Las propiedades `undefined` no se guardan. */
export function aJsonObjeto(objeto: object): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(objeto)
      .filter(([, valor]) => valor !== undefined)
      .map(([clave, valor]) => [clave, aJsonAnidado(valor)]),
  );
}
