/**
 * Lectura de `configuracion` con Prisma (F0-28): implementa
 * `LectorConfiguracion` (`src/puertos/repositorios/configuracion.ts`).
 */
import type { LectorConfiguracion } from "../../puertos/repositorios/configuracion.ts";
import type { PrismaClient } from "./generado/client.ts";

export function crearLectorConfiguracion(
  prisma: PrismaClient,
): LectorConfiguracion {
  return {
    async leer(clave) {
      const fila = await prisma.configuracion.findUnique({ where: { clave } });
      return fila === null ? null : fila.valor;
    },
  };
}
