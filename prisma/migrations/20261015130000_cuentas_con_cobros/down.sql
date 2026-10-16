-- Reversión de 20261015130000_cuentas_con_cobros (P1, docs/convenciones-base.md).
-- Escrito a mano: la migración solo crea un disparador y su función, que `prisma migrate diff` no ve
-- (el esquema de Prisma no cambia). Deshace exactamente eso, en orden inverso.

DROP TRIGGER "cuentas_con_cobros_vigentes" ON "cuentas";

DROP FUNCTION "cuentas_con_cobros_vigentes"();
