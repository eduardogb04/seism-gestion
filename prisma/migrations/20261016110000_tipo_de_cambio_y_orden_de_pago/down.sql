-- Reversión de 20261016110000_tipo_de_cambio_y_orden_de_pago (P1, docs/convenciones-base.md).
-- Deshace exactamente lo que crea `migration.sql`: la clave foránea y el índice de la orden de pago
-- y las columnas nuevas de `cobros`, `egresos`, `facturas` y `ordenes_de_compra`.

-- DropForeignKey
ALTER TABLE "cobros" DROP CONSTRAINT "cobros_orden_pago_documento_id_fkey";

-- DropIndex
DROP INDEX "cobros_orden_pago_documento_id_idx";

-- AlterTable
ALTER TABLE "cobros" DROP COLUMN "orden_pago_numero",
DROP COLUMN "orden_pago_documento_id";

-- AlterTable
ALTER TABLE "egresos" DROP COLUMN "cambio_numerador",
DROP COLUMN "cambio_denominador",
DROP COLUMN "cambio_fuente";

-- AlterTable
ALTER TABLE "facturas" DROP COLUMN "cambio_numerador",
DROP COLUMN "cambio_denominador",
DROP COLUMN "cambio_fuente";

-- AlterTable
ALTER TABLE "ordenes_de_compra" DROP COLUMN "cambio_numerador",
DROP COLUMN "cambio_denominador",
DROP COLUMN "cambio_fuente";
