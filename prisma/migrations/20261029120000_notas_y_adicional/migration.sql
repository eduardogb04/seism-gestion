-- Notas de crédito y de débito y la factura adicional (F6-03, ADR 0050), sobre la tabla de
-- facturas. Escrito con la forma de `prisma migrate diff` y comprobado por el test de migraciones (diff
-- vacío contra `schema.prisma`). Lo que el diff no ve: los tres CHECK y el índice de
-- número único, que ahora es por tipo (una nota de crédito tiene su propia numeración).

-- AlterTable
ALTER TABLE "facturas" ADD COLUMN     "adicional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "comprobante_asociado_id" UUID,
ADD COLUMN     "motivo_anulacion" TEXT,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'factura';

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_comprobante_asociado_id_fkey" FOREIGN KEY ("comprobante_asociado_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "facturas" ADD CONSTRAINT "facturas_tipo_valido" CHECK ("tipo" IN ('factura', 'nota_debito', 'nota_credito'));
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_adicional_solo_factura" CHECK (NOT "adicional" OR "tipo" = 'factura');
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_nota_credito_asociada" CHECK ("tipo" <> 'nota_credito' OR "comprobante_asociado_id" IS NOT NULL);

DROP INDEX "facturas_numero_unico";
CREATE UNIQUE INDEX "facturas_numero_unico" ON "facturas" ("tipo", lower("numero")) WHERE ("eliminado_en" IS NULL);
