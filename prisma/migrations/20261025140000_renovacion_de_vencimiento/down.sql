-- Reversión de 20261025140000_renovacion_de_vencimiento (P1, docs/convenciones-base.md).
-- Se generó con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema <schema
-- anterior> --script`: los enlaces a los servicios de renovación se pierden con la columna.

-- DropForeignKey
ALTER TABLE "servicios_vencimientos" DROP CONSTRAINT "servicios_vencimientos_servicio_renovacion_id_fkey";

-- AlterTable
ALTER TABLE "servicios_vencimientos" DROP COLUMN "servicio_renovacion_id";

