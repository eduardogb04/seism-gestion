/**
 * `Transaccional` con Prisma (F0-30, ADR 0024): cada `ejecutar` es una
 * `$transaction` interactiva, y los repositorios que recibe el trabajo están
 * atados a ella. Si el trabajo lanza, Prisma hace `ROLLBACK` y el error sigue
 * de largo hacia quien llamó.
 */

import type { Transaccional } from "../../puertos/repositorios/transaccion.ts";
import { crearAuditoriaPrisma } from "./auditoria.ts";
import type { PrismaClient } from "./generado/client.ts";
import { crearRepositorioSesionesPrisma } from "./sesiones.ts";
import { crearRepositorioUsuariosPrisma } from "./usuarios.ts";

/** Un `Transaccional` sobre `prisma`. */
export function crearTransaccionalPrisma(prisma: PrismaClient): Transaccional {
  return {
    ejecutar(trabajo) {
      return prisma.$transaction((tx) =>
        trabajo({
          usuarios: crearRepositorioUsuariosPrisma(tx),
          sesiones: crearRepositorioSesionesPrisma(tx),
          auditoria: crearAuditoriaPrisma(tx),
        }),
      );
    },
  };
}
