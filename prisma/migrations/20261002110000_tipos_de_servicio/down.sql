-- Reversión de 20261002110000_tipos_de_servicio (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema de main> --script` y revisado a mano: deshace exactamente lo que crea `migration.sql`
-- (la tabla `tipos_servicio` y, con ella, su clave primaria y el índice `tipos_servicio_nombre_unico`,
-- que la migración escribe a mano).

-- DropTable
DROP TABLE "tipos_servicio";
