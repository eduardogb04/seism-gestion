/**
 * Lo que comparten los tests de IA del nivel casos de uso (F0-28): el reloj
 * fijo, la configuración del tope y un log que se puede leer.
 */

import { expect } from "vitest";
import type { crearClientePrisma } from "../../../src/adaptadores/prisma/cliente.ts";
import {
  crearFechaHora,
  type FechaHora,
  type PartesFechaHora,
} from "../../../src/dominio/compartido/reloj.ts";
import { crearLog, type Log } from "../../../src/infraestructura/log.ts";

export type ClientePrisma = ReturnType<typeof crearClientePrisma>;

/** Una `FechaHora` que el test sabe válida. */
export function fecha(
  partes: Pick<PartesFechaHora, "anio" | "mes" | "dia"> &
    Partial<PartesFechaHora>,
): FechaHora {
  const resultado = crearFechaHora({
    hora: 0,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
    ...partes,
  });
  if (!resultado.ok) {
    throw new Error(`fecha de test inválida: ${resultado.mensaje}`);
  }
  return resultado.fechaHora;
}

/** Deja en `configuracion` exactamente estas claves (la base ya viene limpia). */
export async function fijarConfiguracion(
  prisma: ClientePrisma,
  valores: Readonly<Record<string, string>>,
): Promise<void> {
  await prisma.configuracion.deleteMany();
  await prisma.configuracion.createMany({
    data: Object.entries(valores).map(([clave, valor]) => ({ clave, valor })),
  });
}

/** Un log JSON que escribe en memoria, con sus líneas ya parseadas. */
export function capturarLog(): {
  readonly log: Log;
  lineas(): readonly Record<string, unknown>[];
} {
  const escritas: string[] = [];
  const log = crearLog({
    formato: "json",
    nivel: "info",
    destino: { write: (linea) => escritas.push(linea) },
  });
  return {
    log,
    lineas: () =>
      escritas
        .join("")
        .split("\n")
        .filter((linea) => linea !== "")
        .map((linea) => {
          const registro: unknown = JSON.parse(linea);
          expect(registro).toBeTypeOf("object");
          return registro as Record<string, unknown>;
        }),
  };
}
