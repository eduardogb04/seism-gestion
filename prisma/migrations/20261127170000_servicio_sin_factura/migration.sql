-- Servicio sin factura (R8, SYSTEM_SPEC §5.1): «lleva factura» en el servicio y el comprobante
-- interno como un tipo más de la tabla de comprobantes.

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "lleva_factura" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "facturas" DROP CONSTRAINT "facturas_tipo_valido";
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_tipo_valido" CHECK ("tipo" IN ('factura', 'nota_debito', 'nota_credito', 'interno'));
ALTER TABLE "facturas" DROP CONSTRAINT "facturas_adicional_solo_factura";
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_adicional_solo_factura" CHECK (NOT "adicional" OR "tipo" IN ('factura', 'interno'));
