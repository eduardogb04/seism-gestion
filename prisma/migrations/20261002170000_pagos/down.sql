-- Reversión de 20261002170000_pagos (P1, docs/convenciones-base.md).
-- La tabla sale de `prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema anterior> --script`; los disparadores y sus funciones, a mano: deshace exactamente
-- lo que crea `migration.sql`.

DROP TRIGGER "egresos_con_pagos_vigentes" ON "egresos";
DROP FUNCTION "egresos_con_pagos_vigentes"();
DROP TRIGGER "cuentas_con_pagos_vigentes" ON "cuentas";
DROP FUNCTION "cuentas_con_pagos_vigentes"();

-- DropForeignKey
ALTER TABLE "pagos" DROP CONSTRAINT "pagos_egreso_id_fkey";

-- DropForeignKey
ALTER TABLE "pagos" DROP CONSTRAINT "pagos_cuenta_id_fkey";

-- DropTable
DROP TABLE "pagos";

