-- Reversión de 20261127150000_ajustes_facturacion (P1, docs/convenciones-base.md).
-- Se niega si hay ajustes: sin la tabla cambiaría lo que queda por facturar.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ajustes_facturacion") THEN
    RAISE EXCEPTION 'hay ajustes de facturación: no se revierte';
  END IF;
END $$;

DROP TABLE "ajustes_facturacion";
