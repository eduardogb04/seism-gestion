/**
 * La cola de fallidos en Postgres (F0-25, ADR 0025): tabla `fallidos`. Un
 * fallido entra pendiente (`resuelto_en` nulo) y sin reintento programado
 * (`proximo_intento` nulo: en Fase 0 nadie lo reintenta solo).
 */

import type { ColaFallidos } from "../../puertos/cola-fallidos.ts";
import type { PrismaClient } from "./generado/client.ts";

export function crearColaFallidosPrisma(prisma: PrismaClient): ColaFallidos {
  return {
    async encolar(fallo) {
      await prisma.fallido.create({
        data: {
          origen: fallo.origen,
          codigoError: fallo.codigoError,
          carga: fallo.carga,
          intentos: fallo.intentos,
        },
      });
    },
    contarPendientes() {
      return prisma.fallido.count({ where: { resueltoEn: null } });
    },
  };
}
