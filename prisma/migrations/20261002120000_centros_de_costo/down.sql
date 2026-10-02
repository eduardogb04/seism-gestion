-- Reversión de 20261002120000_centros_de_costo (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema anterior> --script` y revisado a mano: deshace exactamente lo que crea `migration.sql`
-- (la tabla `centros_costo` y, con ella, su clave primaria y el índice `centros_costo_nombre_unico`,
-- que la migración escribe a mano).

-- DropTable
DROP TABLE "centros_costo";
