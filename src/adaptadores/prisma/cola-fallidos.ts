/**
 * La cola de fallidos en Postgres (F0-25, ADR 0025): tabla `fallidos`. Un
 * fallido entra pendiente (`resuelto_en` nulo) y sin reintento programado
 * (`proximo_intento` nulo: en Fase 0 nadie lo reintenta solo).
 */

import type { Codigo } from "../../dominio/compartido/errores/catalogo.ts";
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
    async listarPendientes(limite) {
      const filas = await prisma.fallido.findMany({
        where: { resueltoEn: null },
        orderBy: { creadoEn: "asc" },
        take: limite,
        select: { id: true, origen: true, codigoError: true, creadoEn: true },
      });
      return filas.map((fila) => ({
        id: fila.id,
        origen: fila.origen,
        codigoError: fila.codigoError as Codigo,
        creadoEn: fila.creadoEn,
      }));
    },
  };
}
