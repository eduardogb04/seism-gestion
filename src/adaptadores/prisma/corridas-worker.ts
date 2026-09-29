/**
 * El registro de corridas del worker en Postgres (F0-25, ADR 0025): tabla
 * `corridas_worker`, una fila por corrida.
 */

import type { RegistroCorridas } from "../../puertos/repositorios/corridas-worker.ts";
import type { PrismaClient } from "./generado/client.ts";

export function crearRegistroCorridasPrisma(
  prisma: PrismaClient,
): RegistroCorridas {
  return {
    async iniciar(job, inicio) {
      const { id } = await prisma.corridaWorker.create({
        data: { job, inicio },
        select: { id: true },
      });
      return id;
    },
    async terminar(id, { fin, resultado, detalle }) {
      await prisma.corridaWorker.update({
        where: { id },
        data: { fin, resultado, detalle },
      });
    },
    ultimaCorrida(job) {
      return prisma.corridaWorker.findFirst({
        where: { job },
        orderBy: { inicio: "desc" },
        select: {
          job: true,
          inicio: true,
          fin: true,
          resultado: true,
          detalle: true,
        },
      });
    },
  };
}
