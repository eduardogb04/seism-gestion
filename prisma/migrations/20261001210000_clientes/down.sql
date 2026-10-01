-- Reversión de 20261001210000_clientes (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema de main> --script` y revisado a mano: deshace exactamente lo que crea `migration.sql`
-- (la tabla `clientes` y, con ella, su clave primaria y los índices `clientes_razon_social_unico`
-- y `clientes_cuit_unico`, que la migración escribe a mano).

-- DropForeignKey
ALTER TABLE "clientes" DROP CONSTRAINT "clientes_grupo_id_fkey";

-- DropTable
DROP TABLE "clientes";

