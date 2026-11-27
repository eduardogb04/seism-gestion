-- AlterTable
ALTER TABLE "facturas" ADD COLUMN     "anticipo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ordenes_de_compra" ADD COLUMN     "reemplazada_en" TIMESTAMPTZ(3),
ADD COLUMN     "reemplazada_por_id" UUID;

-- CreateTable
CREATE TABLE "ampliaciones_de_oc" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orden_compra_id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "importe_centavos" BIGINT NOT NULL,
    "nueva_fecha_fin" DATE,
    "documento_id" UUID,
    "observaciones" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "ampliaciones_de_oc_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ordenes_de_compra" ADD CONSTRAINT "ordenes_de_compra_reemplazada_por_id_fkey" FOREIGN KEY ("reemplazada_por_id") REFERENCES "ordenes_de_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ampliaciones_de_oc" ADD CONSTRAINT "ampliaciones_de_oc_orden_compra_id_fkey" FOREIGN KEY ("orden_compra_id") REFERENCES "ordenes_de_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ampliaciones_de_oc" ADD CONSTRAINT "ampliaciones_de_oc_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
