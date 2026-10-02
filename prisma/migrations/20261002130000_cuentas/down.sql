-- Reversión de 20261002130000_cuentas (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema de main> --script` y revisado a mano: deshace exactamente lo que crea `migration.sql`
-- (la tabla `cuentas` y, con ella, su clave primaria y el índice `cuentas_nombre_unico`,
-- que la migración escribe a mano).

-- DropTable
DROP TABLE "cuentas";
