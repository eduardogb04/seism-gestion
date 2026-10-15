-- Reversión de 20261015100000_ordenes_de_compra_y_facturas (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema anterior> --script` y revisado a mano: deshace exactamente lo que crea `migration.sql`
-- (las tablas `ordenes_de_compra` y `facturas`, con sus claves foráneas y el índice único del número;
-- el índice se va con su tabla).

-- DropForeignKey
ALTER TABLE "ordenes_de_compra" DROP CONSTRAINT "ordenes_de_compra_documento_id_fkey";

-- DropForeignKey
ALTER TABLE "facturas" DROP CONSTRAINT "facturas_servicio_id_fkey";

-- DropForeignKey
ALTER TABLE "facturas" DROP CONSTRAINT "facturas_orden_compra_id_fkey";

-- DropForeignKey
ALTER TABLE "facturas" DROP CONSTRAINT "facturas_documento_id_fkey";

-- DropTable
DROP TABLE "ordenes_de_compra";

-- DropTable
DROP TABLE "facturas";

