-- CreateTable
CREATE TABLE "cobros" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "factura_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "importe_centavos" BIGINT NOT NULL,
    "importe_moneda" TEXT NOT NULL,
    "retencion_centavos" BIGINT,
    "cuenta_id" UUID NOT NULL,
    "entrada_centavos" BIGINT NOT NULL,
    "entrada_moneda" TEXT NOT NULL,
    "cambio_numerador" BIGINT,
    "cambio_denominador" BIGINT,
    "cambio_fuente" TEXT,
    "observaciones" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "cobros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cobros_factura_id_idx" ON "cobros"("factura_id");

-- CreateIndex
CREATE INDEX "cobros_cuenta_id_idx" ON "cobros"("cuenta_id");

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un cobro cancela deuda con su importe más su retención: ninguno de los dos es negativo y,
-- juntos, son más que cero (una retención sola puede ser el cobro).
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_importes_validos" CHECK (
  "importe_centavos" >= 0
  AND COALESCE("retencion_centavos", 0) >= 0
  AND "importe_centavos" + COALESCE("retencion_centavos", 0) > 0
);
