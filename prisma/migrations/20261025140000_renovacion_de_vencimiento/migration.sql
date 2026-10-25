-- La renovación de un vencimiento (F4-07): el servicio que cotiza la renovación. Generado con
-- `npx prisma migrate diff --from-schema <schema de main> --to-schema prisma/schema.prisma --script`.

-- AlterTable
ALTER TABLE "servicios_vencimientos" ADD COLUMN     "servicio_renovacion_id" UUID;

-- AddForeignKey
ALTER TABLE "servicios_vencimientos" ADD CONSTRAINT "servicios_vencimientos_servicio_renovacion_id_fkey" FOREIGN KEY ("servicio_renovacion_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

