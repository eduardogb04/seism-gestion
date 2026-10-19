-- AlterTable
ALTER TABLE "ordenes_de_compra" ADD COLUMN     "cambio_numerador" BIGINT,
ADD COLUMN     "cambio_denominador" BIGINT,
ADD COLUMN     "cambio_fuente" TEXT;

-- AlterTable
ALTER TABLE "facturas" ADD COLUMN     "cambio_numerador" BIGINT,
ADD COLUMN     "cambio_denominador" BIGINT,
ADD COLUMN     "cambio_fuente" TEXT;

-- AlterTable
ALTER TABLE "egresos" ADD COLUMN     "cambio_numerador" BIGINT,
ADD COLUMN     "cambio_denominador" BIGINT,
ADD COLUMN     "cambio_fuente" TEXT;

-- AlterTable
ALTER TABLE "cobros" ADD COLUMN     "orden_pago_numero" TEXT,
ADD COLUMN     "orden_pago_documento_id" UUID;

-- CreateIndex
CREATE INDEX "cobros_orden_pago_documento_id_idx" ON "cobros"("orden_pago_documento_id");

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_orden_pago_documento_id_fkey" FOREIGN KEY ("orden_pago_documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
