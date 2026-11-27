-- Reversión de 20261127120000_plantillas_recursos (P1, docs/convenciones-base.md): quita las dos tablas
-- (el índice único se va con `plantillas_recursos`). Las plantillas cargadas no vuelven.

-- DropForeignKey
ALTER TABLE "plantillas_recursos" DROP CONSTRAINT "plantillas_recursos_tipo_servicio_id_fkey";

-- DropForeignKey
ALTER TABLE "plantillas_recursos_items" DROP CONSTRAINT "plantillas_recursos_items_plantilla_id_fkey";

-- DropTable
DROP TABLE "plantillas_recursos";

-- DropTable
DROP TABLE "plantillas_recursos_items";
