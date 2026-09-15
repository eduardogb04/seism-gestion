/**
 * El mecanismo de semilla (F0-10): `npm run db:seed` lo corre después de
 * validar el entorno (`scripts/db-seed.ts`). Acá solo vive **el mecanismo**:
 * los tres casos reales (Rio Tinto, MARA, el camión) son Fase 1.
 *
 * Importa solo de `adaptadores/prisma` (el cliente generado, para el tipo):
 * la validación de entorno y el permiso para correr en el servidor viven en
 * `scripts/db-seed.ts`, no acá. Así `sembrar` se prueba sola, dos veces
 * seguidas contra un Postgres real, sin nada de eso en el medio
 * (`tests/casos-uso/seed.test.ts`).
 *
 * **Las semillas de Fase 1 serán ficticias**: clientes, sitios, personas y
 * montos inventados que respeten la forma de los tres casos reales. El repo
 * es público (P14, AGENTS.md regla 1): ni un dato real entra acá, ni ahora ni
 * en Fase 1.
 */

import type { PrismaClient } from "../src/adaptadores/prisma/generado/client.ts";

/** Claves de `configuracion` con su valor por defecto. Hoy, una sola. */
const CONFIGURACION_POR_DEFECTO: ReadonlyArray<{
  readonly clave: string;
  readonly valor: string;
}> = [
  // El tope de gasto mensual de IA (lote 7): sin tope hasta que exista.
  { clave: "ia.tope_mensual_usd", valor: "0" },
];

/**
 * Inserta las claves de `configuracion` que todavía no existen y actualiza
 * las que cambiaron de valor. **Idempotente**: si una clave ya tiene el valor
 * por defecto, no la toca (ni una escritura), así correrla dos veces deja la
 * base exactamente igual, `id` y `creado_en` incluidos.
 */
export async function sembrar(prisma: PrismaClient): Promise<void> {
  for (const { clave, valor } of CONFIGURACION_POR_DEFECTO) {
    const existente = await prisma.configuracion.findUnique({
      where: { clave },
    });
    if (existente === null) {
      await prisma.configuracion.create({ data: { clave, valor } });
    } else if (existente.valor !== valor) {
      await prisma.configuracion.update({ where: { clave }, data: { valor } });
    }
  }
}
