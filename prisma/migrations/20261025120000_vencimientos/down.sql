-- Reversión de 20261025120000_vencimientos (P1, docs/convenciones-base.md).
-- Se generó con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema <schema
-- anterior> --script` y se revisó a mano: borra la tabla (los vencimientos cargados se pierden
-- con ella, y con ella sus CHECK).

-- DropForeignKey
ALTER TABLE "servicios_vencimientos" DROP CONSTRAINT "servicios_vencimientos_servicio_id_fkey";

-- DropForeignKey
ALTER TABLE "servicios_vencimientos" DROP CONSTRAINT "servicios_vencimientos_sitio_id_fkey";

-- DropForeignKey
ALTER TABLE "servicios_vencimientos" DROP CONSTRAINT "servicios_vencimientos_camion_id_fkey";

-- DropTable
DROP TABLE "servicios_vencimientos";

