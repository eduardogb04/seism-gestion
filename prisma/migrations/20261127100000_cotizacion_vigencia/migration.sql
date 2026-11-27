-- Vigencia de la cotización en días (R2): el calendario avisa cuando se cumple.

-- AlterTable
ALTER TABLE "cotizaciones" ADD COLUMN     "vigencia_dias" INTEGER;
