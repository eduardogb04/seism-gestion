-- Reversión de 20261002180000_documentos_y_cotizaciones (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema anterior> --script` y revisado a mano: deshace exactamente lo que crea `migration.sql`
-- (las tablas `documentos` y `cotizaciones`, con sus claves foráneas y el índice único de la versión).

-- DropForeignKey
ALTER TABLE "cotizaciones" DROP CONSTRAINT "cotizaciones_servicio_id_fkey";

-- DropForeignKey
ALTER TABLE "cotizaciones" DROP CONSTRAINT "cotizaciones_documento_id_fkey";

-- DropTable
DROP TABLE "documentos";

-- DropTable
DROP TABLE "cotizaciones";

