-- Reversión de 20261002140000_camiones (P1, docs/convenciones-base.md).
-- Deshace exactamente lo que crea `migration.sql` (la tabla `camiones` y, con
-- ella, su clave primaria y los índices `camiones_patente_tractor_unico` y
-- `camiones_patente_cisterna_unico`, que la migración escribe a mano).

-- DropForeignKey
ALTER TABLE "camiones" DROP CONSTRAINT "camiones_cliente_id_fkey";

-- DropTable
DROP TABLE "camiones";
