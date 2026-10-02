-- Reversión de 20261002150000_egresos (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema anterior> --script` y revisado a mano: deshace exactamente lo que crea `migration.sql`
-- (la tabla `egresos` con sus dos claves foráneas).

-- DropForeignKey
ALTER TABLE "egresos" DROP CONSTRAINT "egresos_centro_costo_id_fkey";

-- DropForeignKey
ALTER TABLE "egresos" DROP CONSTRAINT "egresos_proveedor_id_fkey";

-- DropTable
DROP TABLE "egresos";
