-- Reversión de 20261025110000_sucesos_del_cliente (P1, docs/convenciones-base.md).
-- Se generó con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema anterior> --script` y se revisó a mano: antes de volver a exigir el servicio se
-- borran las situaciones sueltas (sin servicio), que el esquema anterior no puede guardar.

-- DropForeignKey
ALTER TABLE "servicios_sucesos" DROP CONSTRAINT "servicios_sucesos_cliente_id_fkey";

-- DropIndex
DROP INDEX "servicios_sucesos_cliente_id_idx";

DELETE FROM "servicios_sucesos" WHERE "servicio_id" IS NULL;

-- AlterTable
ALTER TABLE "servicios_sucesos" DROP COLUMN "cliente_id",
ALTER COLUMN "servicio_id" SET NOT NULL;
