-- Plantillas de hitos y materiales de un servicio (F6-02, ADR 0049).

-- AlterTable
ALTER TABLE "servicios_recursos" ADD COLUMN     "cantidad" TEXT;

-- CreateTable
CREATE TABLE "plantillas_hitos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "tipo_servicio_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "plantillas_hitos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantillas_hitos_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plantilla_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,

    CONSTRAINT "plantillas_hitos_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plantillas_hitos_tipo_servicio_id_idx" ON "plantillas_hitos"("tipo_servicio_id");

-- CreateIndex
CREATE INDEX "plantillas_hitos_items_plantilla_id_idx" ON "plantillas_hitos_items"("plantilla_id");

-- AddForeignKey
ALTER TABLE "plantillas_hitos" ADD CONSTRAINT "plantillas_hitos_tipo_servicio_id_fkey" FOREIGN KEY ("tipo_servicio_id") REFERENCES "tipos_servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantillas_hitos_items" ADD CONSTRAINT "plantillas_hitos_items_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "plantillas_hitos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- El nombre único, sin distinguir mayúsculas, va a mano: Prisma no declara índices sobre expresiones.
CREATE UNIQUE INDEX "plantillas_hitos_nombre_unico" ON "plantillas_hitos" (lower("nombre")) WHERE ("eliminado_en" IS NULL);
