-- Los vencimientos de un trabajo terminado (F4-02, ADR 0045). Generado con
-- `npx prisma migrate diff --from-schema <schema de main> --to-schema prisma/schema.prisma --script`
-- y revisado a mano; los CHECK están escritos a mano (Prisma no declara CHECK).

-- CreateTable
CREATE TABLE "servicios_vencimientos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "servicio_id" UUID NOT NULL,
    "sitio_id" UUID,
    "camion_id" UUID,
    "fecha" DATE NOT NULL,
    "descripcion" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "motivo_descarte" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "servicios_vencimientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "servicios_vencimientos_servicio_id_idx" ON "servicios_vencimientos"("servicio_id");

-- CreateIndex
CREATE INDEX "servicios_vencimientos_fecha_idx" ON "servicios_vencimientos"("fecha");

-- AddForeignKey
ALTER TABLE "servicios_vencimientos" ADD CONSTRAINT "servicios_vencimientos_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_vencimientos" ADD CONSTRAINT "servicios_vencimientos_sitio_id_fkey" FOREIGN KEY ("sitio_id") REFERENCES "sitios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_vencimientos" ADD CONSTRAINT "servicios_vencimientos_camion_id_fkey" FOREIGN KEY ("camion_id") REFERENCES "camiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A lo sumo un sitio o un camión; el origen y el estado, de los valores que el dominio conoce.
-- La misma regla está en el dominio; esto la sostiene aunque alguien escriba por otro lado.
ALTER TABLE "servicios_vencimientos" ADD CONSTRAINT "servicios_vencimientos_a_lo_sumo_uno" CHECK (
    "sitio_id" IS NULL OR "camion_id" IS NULL
);

ALTER TABLE "servicios_vencimientos" ADD CONSTRAINT "servicios_vencimientos_origen" CHECK (
    "origen" IN ('calculado', 'manual')
);

ALTER TABLE "servicios_vencimientos" ADD CONSTRAINT "servicios_vencimientos_estado" CHECK (
    "estado" IN ('pendiente', 'renovado', 'descartado')
);
