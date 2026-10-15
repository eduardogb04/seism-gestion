-- Reversión de 20261015110000_egresos_servicio_y_comprobante (P1, docs/convenciones-base.md).
-- Deshace exactamente lo que crea `migration.sql`: las dos claves foráneas y las dos columnas de `egresos`.

-- DropForeignKey
ALTER TABLE "egresos" DROP CONSTRAINT "egresos_servicio_id_fkey";

-- DropForeignKey
ALTER TABLE "egresos" DROP CONSTRAINT "egresos_comprobante_id_fkey";

-- AlterTable
ALTER TABLE "egresos" DROP COLUMN "servicio_id",
DROP COLUMN "comprobante_id";
