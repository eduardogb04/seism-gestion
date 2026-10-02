-- CreateTable
CREATE TABLE "camiones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "patente_tractor" TEXT NOT NULL,
    "marca_tractor" TEXT NOT NULL,
    "anio_tractor" INTEGER NOT NULL,
    "patente_cisterna" TEXT,
    "marca_cisterna" TEXT,
    "anio_cisterna" INTEGER,
    "capacidad_litros" INTEGER NOT NULL,
    "observaciones" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "camiones_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "camiones" ADD CONSTRAINT "camiones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Escrito a mano: Prisma no declara índices sobre expresiones. Cada patente (sin
-- distinguir mayúsculas) es única entre los camiones no eliminados; la de la
-- cisterna solo entre los que la tienen (un chasis no lleva).
CREATE UNIQUE INDEX "camiones_patente_tractor_unico" ON "camiones" (lower("patente_tractor")) WHERE ("eliminado_en" IS NULL);
CREATE UNIQUE INDEX "camiones_patente_cisterna_unico" ON "camiones" (lower("patente_cisterna")) WHERE ("eliminado_en" IS NULL AND "patente_cisterna" IS NOT NULL);
