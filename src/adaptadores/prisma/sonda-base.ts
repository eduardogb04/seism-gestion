/**
 * La sonda de la integración `base` (F0-25): un `SELECT 1`. Si resuelve, la
 * base responde; si rechaza (conexión caída, credenciales), `listarSalud` la
 * marca en error.
 */

import type { SondaIntegracion } from "../../puertos/sonda-integracion.ts";
import type { PrismaClient } from "./generado/client.ts";

export function crearSondaBase(prisma: PrismaClient): SondaIntegracion {
  return {
    nombre: "base",
    async probar() {
      await prisma.$queryRaw`SELECT 1`;
    },
  };
}
