-- Reversión de 20261127170000_servicio_sin_factura (P1, docs/convenciones-base.md).
-- Falla si ya hay comprobantes internos: se anulan y se borran antes.
ALTER TABLE "facturas" DROP CONSTRAINT "facturas_adicional_solo_factura";
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_adicional_solo_factura" CHECK (NOT "adicional" OR "tipo" = 'factura');
ALTER TABLE "facturas" DROP CONSTRAINT "facturas_tipo_valido";
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_tipo_valido" CHECK ("tipo" IN ('factura', 'nota_debito', 'nota_credito'));
ALTER TABLE "servicios" DROP COLUMN "lleva_factura";
