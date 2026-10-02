-- Reversión de 20261002160000_servicios (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema anterior> --script` y revisado a mano: deshace exactamente lo que crea `migration.sql`
-- (las tablas `servicios`, `servicios_eventos`, `servicios_sitios` y `secuencias`, con sus claves
-- foráneas y el índice único del código).

-- DropForeignKey
ALTER TABLE "servicios" DROP CONSTRAINT "servicios_cliente_id_fkey";

-- DropForeignKey
ALTER TABLE "servicios" DROP CONSTRAINT "servicios_tipo_servicio_id_fkey";

-- DropForeignKey
ALTER TABLE "servicios" DROP CONSTRAINT "servicios_responsable_id_fkey";

-- DropForeignKey
ALTER TABLE "servicios_eventos" DROP CONSTRAINT "servicios_eventos_servicio_id_fkey";

-- DropForeignKey
ALTER TABLE "servicios_sitios" DROP CONSTRAINT "servicios_sitios_servicio_id_fkey";

-- DropForeignKey
ALTER TABLE "servicios_sitios" DROP CONSTRAINT "servicios_sitios_sitio_id_fkey";

-- DropTable
DROP TABLE "servicios";

-- DropTable
DROP TABLE "servicios_eventos";

-- DropTable
DROP TABLE "servicios_sitios";

-- DropTable
DROP TABLE "secuencias";
