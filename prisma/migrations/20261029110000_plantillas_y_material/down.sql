-- Reversión de 20261029110000_plantillas_y_material (P1, docs/convenciones-base.md).
-- Generado con `prisma migrate diff` desde el esquema nuevo hacia el de `main`; revisado a mano: deshace
-- la columna `cantidad` y las dos tablas de plantillas (con sus claves foráneas), y el índice único
-- se va con `plantillas_hitos`. Las plantillas y las cantidades cargadas no vuelven.

-- DropForeignKey
ALTER TABLE "plantillas_hitos" DROP CONSTRAINT "plantillas_hitos_tipo_servicio_id_fkey";

-- DropForeignKey
ALTER TABLE "plantillas_hitos_items" DROP CONSTRAINT "plantillas_hitos_items_plantilla_id_fkey";

-- AlterTable
ALTER TABLE "servicios_recursos" DROP COLUMN "cantidad";

-- DropTable
DROP TABLE "plantillas_hitos";

-- DropTable
DROP TABLE "plantillas_hitos_items";

