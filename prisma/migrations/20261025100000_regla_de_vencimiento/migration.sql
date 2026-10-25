-- La regla de vencimiento de cada tipo de servicio (F4-01, ADR 0043): el plazo común, el de los
-- camiones antiguos y la antigüedad de corte, en meses y años, todos opcionales. Generado con
-- `npx prisma migrate diff --from-schema <schema de main> --to-schema prisma/schema.prisma --script`
-- y revisado a mano.

-- AlterTable
ALTER TABLE "tipos_servicio" ADD COLUMN     "antiguedad_corte_anios" INTEGER,
ADD COLUMN     "vencimiento_meses" INTEGER,
ADD COLUMN     "vencimiento_meses_antiguos" INTEGER;

-- Escrito a mano: Prisma no declara CHECK (el diff contra `schema.prisma` no lo ve). Cada plazo,
-- si está, es positivo, y el de antiguos va con el corte o ninguno de los dos. La misma regla está
-- en la validación del ABM; esto la sostiene aunque alguien escriba por otro lado.
ALTER TABLE "tipos_servicio" ADD CONSTRAINT "tipos_servicio_regla_de_vencimiento" CHECK (
    "vencimiento_meses" > 0
    AND "vencimiento_meses_antiguos" > 0
    AND "antiguedad_corte_anios" > 0
    AND ("vencimiento_meses_antiguos" IS NULL) = ("antiguedad_corte_anios" IS NULL)
);
