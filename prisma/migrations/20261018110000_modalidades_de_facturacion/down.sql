-- Reversión de 20261018110000_modalidades_de_facturacion (P1, docs/convenciones-base.md).
-- Se generó con `npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema
-- <schema anterior> --script` y se revisó a mano: borra la tabla de cuotas, la modalidad de
-- cada servicio y el período de cada factura (se pierden con ellas).

-- DropForeignKey
ALTER TABLE "servicios_cuotas" DROP CONSTRAINT "servicios_cuotas_servicio_id_fkey";

-- AlterTable
ALTER TABLE "servicios" DROP COLUMN "modalidad_facturacion";

-- AlterTable
ALTER TABLE "facturas" DROP COLUMN "periodo";

-- DropTable
DROP TABLE "servicios_cuotas";

