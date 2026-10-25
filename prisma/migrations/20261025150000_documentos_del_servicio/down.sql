-- Reversión de 20261025150000_documentos_del_servicio (P1, docs/convenciones-base.md).
-- Deshace exactamente lo que crea `migration.sql`: la tabla con sus claves foráneas. Los documentos
-- (`documentos`) quedan; solo se pierde a qué servicio estaban adjuntos.

-- DropForeignKey
ALTER TABLE "servicios_documentos" DROP CONSTRAINT "servicios_documentos_servicio_id_fkey";

-- DropForeignKey
ALTER TABLE "servicios_documentos" DROP CONSTRAINT "servicios_documentos_documento_id_fkey";

-- DropTable
DROP TABLE "servicios_documentos";
