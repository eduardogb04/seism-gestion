-- Los sucesos pasan a ser situaciones del cliente (F4-05, ADR 0044): el cliente es
-- obligatorio y el servicio, opcional. Los que ya existen toman el cliente de su
-- servicio, así que ninguno queda sin cliente ni se pierde.
-- AlterTable
ALTER TABLE "servicios_sucesos" ADD COLUMN     "cliente_id" UUID;

UPDATE "servicios_sucesos" SET "cliente_id" = "servicios"."cliente_id"
FROM "servicios" WHERE "servicios"."id" = "servicios_sucesos"."servicio_id";

-- AlterTable
ALTER TABLE "servicios_sucesos" ALTER COLUMN "cliente_id" SET NOT NULL,
ALTER COLUMN "servicio_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "servicios_sucesos_cliente_id_idx" ON "servicios_sucesos"("cliente_id");

-- AddForeignKey
ALTER TABLE "servicios_sucesos" ADD CONSTRAINT "servicios_sucesos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
