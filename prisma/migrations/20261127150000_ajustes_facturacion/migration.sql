-- CreateTable
CREATE TABLE "ajustes_facturacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "servicio_id" UUID NOT NULL,
    "clase" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "cantidad" TEXT,
    "precio_unitario_centavos" BIGINT,
    "importe_centavos" BIGINT NOT NULL,
    "importe_moneda" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "documento_id" UUID,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "resuelto_en" TIMESTAMPTZ(3),
    "resuelto_por" UUID,
    "motivo_rechazo" TEXT,
    "factura_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "ajustes_facturacion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ajustes_facturacion" ADD CONSTRAINT "ajustes_facturacion_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_facturacion" ADD CONSTRAINT "ajustes_facturacion_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_facturacion" ADD CONSTRAINT "ajustes_facturacion_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
