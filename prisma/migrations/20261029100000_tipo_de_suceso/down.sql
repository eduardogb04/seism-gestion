-- Reversión de 20261029100000_tipo_de_suceso (P1, docs/convenciones-base.md).
-- Quita la columna: se pierde el tipo de cada suceso, que vuelve a verse como «Observación».

-- AlterTable
ALTER TABLE "servicios_sucesos" DROP COLUMN "tipo";
