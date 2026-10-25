-- La renovación de un contrato recurrente (F4-03): los vencimientos pasan a tener una clase, la del
-- trabajo terminado (F4-02, la de todos los que ya existen) o la del contrato. La columna sigue el
-- schema de Prisma; el CHECK y el índice parcial están escritos a mano (Prisma no los declara).

-- AlterTable
ALTER TABLE "servicios_vencimientos" ADD COLUMN "clase" TEXT NOT NULL DEFAULT 'trabajo';

ALTER TABLE "servicios_vencimientos" ADD CONSTRAINT "servicios_vencimientos_clase" CHECK (
    "clase" IN ('trabajo', 'contrato')
);

-- A lo sumo uno pendiente de renovación por servicio: lo sostiene la base aunque alguien escriba por otro lado.
-- Va sobre una expresión (como los índices de camiones): Prisma no declara índices parciales y, sobre la
-- columna sola, el control de drift lo daría por sobrante.
CREATE UNIQUE INDEX "servicios_vencimientos_contrato_unico" ON "servicios_vencimientos" (("servicio_id"::text)) WHERE ("clase" = 'contrato' AND "estado" = 'pendiente' AND "eliminado_en" IS NULL);
