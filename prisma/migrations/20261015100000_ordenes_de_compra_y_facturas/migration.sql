-- CreateTable
CREATE TABLE "ordenes_de_compra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "servicio_id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "importe_centavos" BIGINT NOT NULL,
    "importe_moneda" TEXT NOT NULL,
    "observaciones" TEXT,
    "documento_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "ordenes_de_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "servicio_id" UUID NOT NULL,
    "orden_compra_id" UUID,
    "numero" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "vencimiento" DATE NOT NULL,
    "importe_centavos" BIGINT NOT NULL,
    "importe_moneda" TEXT NOT NULL,
    "alicuota_iva" INTEGER NOT NULL,
    "documento_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "facturas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ordenes_de_compra" ADD CONSTRAINT "ordenes_de_compra_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_de_compra" ADD CONSTRAINT "ordenes_de_compra_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_orden_compra_id_fkey" FOREIGN KEY ("orden_compra_id") REFERENCES "ordenes_de_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex (a mano: Prisma no declara índices sobre expresiones; docs/convenciones-base.md)
-- El número de una factura no se repite entre las vigentes.
CREATE UNIQUE INDEX "facturas_numero_unico" ON "facturas" (lower("numero")) WHERE ("eliminado_en" IS NULL);
