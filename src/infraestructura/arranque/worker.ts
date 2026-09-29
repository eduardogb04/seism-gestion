/**
 * El punto de armado del worker (F0-25, ADR 0004): el único lugar desde
 * donde el worker llega a los adaptadores. Arma el cliente de Prisma y, con
 * él, el registro de corridas y la cola de fallidos.
 */

import { crearClientePrisma } from "../../adaptadores/prisma/cliente.ts";
import { crearColaFallidosPrisma } from "../../adaptadores/prisma/cola-fallidos.ts";
import { crearRegistroCorridasPrisma } from "../../adaptadores/prisma/corridas-worker.ts";
import type { ColaFallidos } from "../../puertos/cola-fallidos.ts";
import type { RegistroCorridas } from "../../puertos/repositorios/corridas-worker.ts";

export type ArmadoWorker = {
  readonly corridas: RegistroCorridas;
  readonly colaFallidos: ColaFallidos;
  /** Cierra las conexiones a la base (al apagar el proceso). */
  cerrar(): Promise<void>;
};

export function armarWorker(urlBase: string): ArmadoWorker {
  const prisma = crearClientePrisma(urlBase);
  return {
    corridas: crearRegistroCorridasPrisma(prisma),
    colaFallidos: crearColaFallidosPrisma(prisma),
    cerrar: () => prisma.$disconnect(),
  };
}
