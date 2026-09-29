-- Reversión de 20260926004900_usuarios_sesiones_auditoria (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema <schema de
-- main> --script` y revisado a mano: deshace exactamente lo que crea `migration.sql`, en orden
-- inverso. Las dos claves foráneas (la nueva de `configuracion.actualizado_por` y la de
-- `sesiones`), las tres tablas (con sus índices y el CHECK del email, que caen con ellas) y los
-- dos tipos enum. `configuracion` queda como estaba: su columna `actualizado_por` no se toca.

-- DropForeignKey
ALTER TABLE "configuracion" DROP CONSTRAINT "configuracion_actualizado_por_fkey";

-- DropForeignKey
ALTER TABLE "sesiones" DROP CONSTRAINT "sesiones_usuario_id_fkey";

-- DropTable
DROP TABLE "usuarios";

-- DropTable
DROP TABLE "sesiones";

-- DropTable
DROP TABLE "auditoria";

-- DropEnum
DROP TYPE "rol_usuario";

-- DropEnum
DROP TYPE "estado_usuario";

