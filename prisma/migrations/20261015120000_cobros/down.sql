-- Reversión de 20261015120000_cobros (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema anterior> --script` y revisado a mano: deshace exactamente lo que crea `migration.sql`
-- (la tabla `cobros`, con sus claves foráneas, sus índices y su CHECK; se van con la tabla).

-- DropForeignKey
ALTER TABLE "cobros" DROP CONSTRAINT "cobros_factura_id_fkey";

-- DropForeignKey
ALTER TABLE "cobros" DROP CONSTRAINT "cobros_cuenta_id_fkey";

-- DropTable
DROP TABLE "cobros";
