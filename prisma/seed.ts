/**
 * El mecanismo de semilla (F0-10): `npm run db:seed` lo corre después de
 * validar el entorno (`scripts/db-seed.ts`). Acá solo vive **el mecanismo**:
 * los casos reales de la empresa son Fase 1.
 *
 * Importa solo de `adaptadores/prisma` (el cliente generado, para el tipo):
 * la validación de entorno y el permiso para correr en el servidor viven en
 * `scripts/db-seed.ts`, no acá. Así `sembrar` se prueba sola, dos veces
 * seguidas contra un Postgres real, sin nada de eso en el medio
 * (`tests/casos-uso/seed.test.ts`).
 *
 * **Las semillas de Fase 1 serán ficticias**: clientes, sitios, personas y
 * montos inventados que respeten la forma de los casos reales de la empresa,
 * sin nombrar ninguno. El repo es público (P14, AGENTS.md regla 1): ni un
 * dato real entra acá, ni ahora ni en Fase 1.
 */

import type { PrismaClient } from "../src/adaptadores/prisma/generado/client.ts";

/** Claves de `configuracion` con su valor por defecto. */
const CONFIGURACION_POR_DEFECTO: ReadonlyArray<{
  readonly clave: string;
  readonly valor: string;
}> = [
  // IA (F0-28, ADR 0026): dólares con punto decimal, hasta seis decimales.
  // Valores inventados de arranque.
  // El tope de gasto del mes: si el gasto del mes más el costo estimado de
  // la llamada lo supera, `interpretar` no llama y lanza IA-0001.
  { clave: "ia.tope_mensual_usd", valor: "10.00" },
  // Costo estimado de una llamada, para el perfil que no tenga su propia
  // clave `ia.costo_estimado_usd.<perfil>`.
  { clave: "ia.costo_estimado_usd.defecto", valor: "0.01" },
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
