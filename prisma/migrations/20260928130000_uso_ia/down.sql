-- Reversión de 20260928130000_uso_ia (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema de main> --script` y revisado a mano: deshace exactamente lo que crea `migration.sql`
-- (la tabla `uso_ia` y, con ella, su clave primaria y el índice `uso_ia_en_idx`). No toca
-- `configuracion`.

-- DropTable
DROP TABLE "uso_ia";
