-- Plantillas de recursos de un servicio (R3, SYSTEM_SPEC §7.1).

-- CreateTable
CREATE TABLE "plantillas_recursos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "tipo_servicio_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "plantillas_recursos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantillas_recursos_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plantilla_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" TEXT,

    CONSTRAINT "plantillas_recursos_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plantillas_recursos_tipo_servicio_id_idx" ON "plantillas_recursos"("tipo_servicio_id");

-- CreateIndex
CREATE INDEX "plantillas_recursos_items_plantilla_id_idx" ON "plantillas_recursos_items"("plantilla_id");

-- AddForeignKey
ALTER TABLE "plantillas_recursos" ADD CONSTRAINT "plantillas_recursos_tipo_servicio_id_fkey" FOREIGN KEY ("tipo_servicio_id") REFERENCES "tipos_servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantillas_recursos_items" ADD CONSTRAINT "plantillas_recursos_items_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "plantillas_recursos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El nombre único, sin distinguir mayúsculas, va a mano: Prisma no declara índices sobre expresiones.
CREATE UNIQUE INDEX "plantillas_recursos_nombre_unico" ON "plantillas_recursos" (lower("nombre")) WHERE ("eliminado_en" IS NULL);
