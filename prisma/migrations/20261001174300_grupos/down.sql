-- Reversión de 20261001174300_grupos (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema de main> --script` y revisado a mano: deshace exactamente lo que crea `migration.sql`
-- (la tabla `grupos` y, con ella, su clave primaria y el índice `grupos_nombre_unico`, que la
-- migración escribe a mano).

-- DropTable
DROP TABLE "grupos";
