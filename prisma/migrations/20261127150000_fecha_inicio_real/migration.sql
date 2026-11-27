-- Fecha de inicio real del servicio (R6): se pide al pasar a «En ejecución».

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "fecha_inicio_real" DATE;
