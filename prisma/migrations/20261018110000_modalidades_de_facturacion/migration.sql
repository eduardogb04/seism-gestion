-- Las modalidades de facturación y la cuota mensual (F3-03, ADR 0041). Un
-- servicio que ya tiene alguna factura, vigente o anulada, queda «Por hitos
-- (libre)»: lo devengado es lo facturado, así sus números no cambian. El resto,
-- sin elegir.
-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "modalidad_facturacion" TEXT;

-- AlterTable
ALTER TABLE "facturas" ADD COLUMN     "periodo" DATE;

-- CreateTable
CREATE TABLE "servicios_cuotas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "servicio_id" UUID NOT NULL,
    "posicion" INTEGER NOT NULL,
    "desde_mes" DATE NOT NULL,
    "importe_centavos" BIGINT NOT NULL,
    "importe_moneda" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "servicios_cuotas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "servicios_cuotas_servicio_id_posicion_key" ON "servicios_cuotas"("servicio_id", "posicion");

-- AddForeignKey
ALTER TABLE "servicios_cuotas" ADD CONSTRAINT "servicios_cuotas_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "servicios" SET "modalidad_facturacion" = 'por_hitos'
WHERE "id" IN (SELECT "servicio_id" FROM "facturas");
