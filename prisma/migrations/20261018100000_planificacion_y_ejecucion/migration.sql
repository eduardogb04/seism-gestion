-- Planificación y ejecución (F3-02): la fecha estimada de inicio de un servicio y, por servicio,
-- sus hitos y sus recursos. Todo es opcional; ninguna fila existente cambia.

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "fecha_inicio_estimada" DATE;

-- CreateTable
CREATE TABLE "servicios_hitos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "servicio_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "realizado_en" DATE,
    "realizado_por" JSONB,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "servicios_hitos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios_recursos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "servicio_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "camion_id" UUID,
    "descripcion" TEXT,
    "desde" DATE,
    "hasta" DATE,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "servicios_recursos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "servicios_hitos_servicio_id_idx" ON "servicios_hitos"("servicio_id");

-- CreateIndex
CREATE INDEX "servicios_recursos_servicio_id_idx" ON "servicios_recursos"("servicio_id");

-- CreateIndex
CREATE INDEX "servicios_recursos_camion_id_idx" ON "servicios_recursos"("camion_id");

-- AddForeignKey
ALTER TABLE "servicios_hitos" ADD CONSTRAINT "servicios_hitos_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_recursos" ADD CONSTRAINT "servicios_recursos_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_recursos" ADD CONSTRAINT "servicios_recursos_camion_id_fkey" FOREIGN KEY ("camion_id") REFERENCES "camiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

