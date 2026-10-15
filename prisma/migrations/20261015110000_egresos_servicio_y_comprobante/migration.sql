-- AlterTable
ALTER TABLE "egresos" ADD COLUMN     "servicio_id" UUID,
ADD COLUMN     "comprobante_id" UUID;

-- AddForeignKey
ALTER TABLE "egresos" ADD CONSTRAINT "egresos_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "egresos" ADD CONSTRAINT "egresos_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
