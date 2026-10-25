-- Reversión de 20261025130000_vencimiento_de_contrato (P1, docs/convenciones-base.md). Los
-- vencimientos de contrato se pierden con la columna: se borran antes, porque sin la clase serían
-- vencimientos de un trabajo que no existe.

DROP INDEX "servicios_vencimientos_contrato_unico";

ALTER TABLE "servicios_vencimientos" DROP CONSTRAINT "servicios_vencimientos_clase";

DELETE FROM "servicios_vencimientos" WHERE "clase" = 'contrato';

-- AlterTable
ALTER TABLE "servicios_vencimientos" DROP COLUMN "clase";
