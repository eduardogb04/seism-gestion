-- Reversión de 20261016100000_recorrido_por_etapas (P1, docs/convenciones-base.md).
-- La parte de esquema se generó con `npx prisma migrate diff --from-schema prisma/schema.prisma
-- --to-schema <schema anterior> --script` y se revisó a mano: borra la tabla de sucesos (los
-- sucesos cargados se pierden con ella).
--
-- Los estados vuelven a sus nombres de antes. «Finalizado» no existía: vuelve a «Vigente», así que
-- un evento «En ejecución» → «Finalizado» queda «Vigente» → «Vigente». Es una pérdida aceptada en el
-- ADR 0039: el historial conserva todos sus eventos, con su fecha y su autor.

-- DropForeignKey
ALTER TABLE "servicios_sucesos" DROP CONSTRAINT "servicios_sucesos_servicio_id_fkey";

-- DropTable
DROP TABLE "servicios_sucesos";

UPDATE "servicios_eventos" SET "de" = 'solicitado' WHERE "de" = 'creado';
UPDATE "servicios_eventos" SET "a" = 'solicitado' WHERE "a" = 'creado';
UPDATE "servicios_eventos" SET "de" = 'vigente' WHERE "de" IN ('en_ejecucion', 'finalizado');
UPDATE "servicios_eventos" SET "a" = 'vigente' WHERE "a" IN ('en_ejecucion', 'finalizado');
