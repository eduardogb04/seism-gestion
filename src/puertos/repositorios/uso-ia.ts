/**
 * Repositorio del registro de uso de IA (F0-28, ADR 0026): la tabla
 * `uso_ia`. Implementado con Prisma en `src/adaptadores/prisma/uso-ia.ts`.
 * Solo crece: no hay método de borrado (regla no negociable 16).
 */
import type { MicroUsd } from "../../dominio/compartido/micro-usd.ts";
import type { FechaHora } from "../../dominio/compartido/reloj.ts";
import type { ValorJson } from "../ia.ts";

/** Una fila nueva de `uso_ia`. La decisión humana la completa Fase 1: nace vacía. */
export type RegistroUsoIa = {
  readonly en: FechaHora;
  readonly perfil: string;
  readonly modelo: string;
  readonly versionPrompt: string;
  readonly costoMicroUsd: MicroUsd;
  readonly tokens: number;
  /** La salida del adaptador tal cual llegó, haya validado o no. */
  readonly propuesta: ValorJson;
  /** Si la salida pasó el esquema del que preguntó. */
  readonly propuestaValida: boolean;
};

export type RepositorioUsoIa = {
  /** Guarda la fila. Si falla, rechaza: quien llama no puede seguir como si hubiera quedado. */
  registrar(registro: RegistroUsoIa): Promise<void>;
  /** Suma de `costo_usd` de las filas con `en` en `[desde, hasta)`, en micro-dólares. */
  costoEntre(desde: FechaHora, hasta: FechaHora): Promise<MicroUsd>;
};
