-- CreateTable
CREATE TABLE "egresos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fecha" DATE NOT NULL,
    "concepto" TEXT NOT NULL,
    "centro_costo_id" UUID NOT NULL,
    "proveedor_id" UUID,
    "numero_comprobante" TEXT,
    "importe_centavos" BIGINT NOT NULL,
    "importe_moneda" TEXT NOT NULL,
    "vencimiento" DATE,
    "observaciones" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "egresos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "egresos" ADD CONSTRAINT "egresos_centro_costo_id_fkey" FOREIGN KEY ("centro_costo_id") REFERENCES "centros_costo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "egresos" ADD CONSTRAINT "egresos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
