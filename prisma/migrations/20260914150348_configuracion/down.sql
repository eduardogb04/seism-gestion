-- Reversión de 20260914150348_configuracion (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-empty --script`
-- y revisado a mano: deshace exactamente lo que crea `migration.sql` (la tabla `configuracion`
-- y, con ella, su clave primaria y su índice único). Aplicado sobre la base migrada, la deja sin
-- tablas propias.

-- DropTable
DROP TABLE "public"."configuracion";
