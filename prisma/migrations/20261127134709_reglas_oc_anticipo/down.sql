-- Reversión de 20261127134709_reglas_oc_anticipo (P1, docs/convenciones-base.md).
-- Deshace exactamente lo de `migration.sql`. Se niega si hay ampliaciones, órdenes reemplazadas o
-- anticipos: sin las columnas cambiaría lo facturado y el total de las órdenes.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ampliaciones_de_oc")
     OR EXISTS (SELECT 1 FROM "ordenes_de_compra" WHERE "reemplazada_en" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "facturas" WHERE "anticipo") THEN
    RAISE EXCEPTION 'hay ampliaciones, órdenes reemplazadas o anticipos: no se revierte';
  END IF;
END $$;

ALTER TABLE "ampliaciones_de_oc" DROP CONSTRAINT "ampliaciones_de_oc_documento_id_fkey";
ALTER TABLE "ampliaciones_de_oc" DROP CONSTRAINT "ampliaciones_de_oc_orden_compra_id_fkey";
ALTER TABLE "ordenes_de_compra" DROP CONSTRAINT "ordenes_de_compra_reemplazada_por_id_fkey";

DROP TABLE "ampliaciones_de_oc";

ALTER TABLE "ordenes_de_compra" DROP COLUMN "reemplazada_en",
DROP COLUMN "reemplazada_por_id";

ALTER TABLE "facturas" DROP COLUMN "anticipo";
