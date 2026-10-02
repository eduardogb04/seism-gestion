-- Reversión de 20261002100000_sitios (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema de main> --script` y revisado a mano: deshace exactamente lo que crea `migration.sql`
-- (la tabla `sitios` y, con ella, su clave primaria y el índice `sitios_cliente_id_nombre_unico`,
-- que la migración escribe a mano).

-- DropForeignKey
ALTER TABLE "sitios" DROP CONSTRAINT "sitios_cliente_id_fkey";

-- DropTable
DROP TABLE "sitios";
