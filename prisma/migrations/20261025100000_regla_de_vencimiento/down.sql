-- Reversión de 20261025100000_regla_de_vencimiento (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema de main> --script` y revisado a mano: se suma la baja del CHECK, que la migración
-- escribe a mano. Los plazos cargados se pierden con sus columnas.

ALTER TABLE "tipos_servicio" DROP CONSTRAINT "tipos_servicio_regla_de_vencimiento";

-- AlterTable
ALTER TABLE "tipos_servicio" DROP COLUMN "antiguedad_corte_anios",
DROP COLUMN "vencimiento_meses",
DROP COLUMN "vencimiento_meses_antiguos";
