-- Reversión de 20261018100000_planificacion_y_ejecucion (P1, docs/convenciones-base.md).
-- Se generó con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema <schema
-- anterior> --script` y se revisó a mano: borra la columna y las dos tablas (los hitos y los
-- recursos cargados se pierden con ellas).

-- DropForeignKey
ALTER TABLE "servicios_hitos" DROP CONSTRAINT "servicios_hitos_servicio_id_fkey";

-- DropForeignKey
ALTER TABLE "servicios_recursos" DROP CONSTRAINT "servicios_recursos_servicio_id_fkey";

-- DropForeignKey
ALTER TABLE "servicios_recursos" DROP CONSTRAINT "servicios_recursos_camion_id_fkey";

-- AlterTable
ALTER TABLE "servicios" DROP COLUMN "fecha_inicio_estimada";

-- DropTable
DROP TABLE "servicios_hitos";

-- DropTable
DROP TABLE "servicios_recursos";

