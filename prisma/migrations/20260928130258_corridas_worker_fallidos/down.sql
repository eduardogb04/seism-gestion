-- Reversión de 20260928130258_corridas_worker_fallidos (P1, docs/convenciones-base.md).
-- Generado con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema <schema de main> --script`
-- y revisado a mano: deshace exactamente lo que crea `migration.sql` (las tablas `corridas_worker`
-- y `fallidos` —con ellas, sus claves primarias y sus índices, el parcial de pendientes incluido—
-- y el tipo `resultado_corrida`, que se borra después de la tabla que lo usa).

-- DropTable
DROP TABLE "corridas_worker";

-- DropTable
DROP TABLE "fallidos";

-- DropEnum
DROP TYPE "resultado_corrida";
