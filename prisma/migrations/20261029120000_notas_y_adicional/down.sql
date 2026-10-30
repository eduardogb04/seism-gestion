-- Reversión de 20261029120000_notas_y_adicional (P1, docs/convenciones-base.md).
-- Deshace exactamente lo de `migration.sql`; el test de migraciones lo aplica y lo revierte. Se niega
-- si hay notas o facturas adicionales, anuladas o no (ADR 0050): sin el tipo pasarían por facturas
-- comunes y cambiarían lo facturado. Primero hay que sacarlas a mano con un respaldo.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "facturas" WHERE "tipo" <> 'factura' OR "adicional") THEN
    RAISE EXCEPTION 'hay notas de crédito, de débito o facturas adicionales: no se revierte';
  END IF;
END $$;

DROP INDEX "facturas_numero_unico";
CREATE UNIQUE INDEX "facturas_numero_unico" ON "facturas" (lower("numero")) WHERE ("eliminado_en" IS NULL);

ALTER TABLE "facturas" DROP CONSTRAINT "facturas_nota_credito_asociada";
ALTER TABLE "facturas" DROP CONSTRAINT "facturas_adicional_solo_factura";
ALTER TABLE "facturas" DROP CONSTRAINT "facturas_tipo_valido";

-- DropForeignKey
ALTER TABLE "facturas" DROP CONSTRAINT "facturas_comprobante_asociado_id_fkey";

-- AlterTable
ALTER TABLE "facturas" DROP COLUMN "adicional",
DROP COLUMN "comprobante_asociado_id",
DROP COLUMN "motivo_anulacion",
DROP COLUMN "tipo";
