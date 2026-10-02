-- CreateTable
CREATE TABLE "sitios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "provincia" TEXT NOT NULL,
    "localidad" TEXT NOT NULL,
    "direccion" TEXT,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "cantidad_tanques" INTEGER NOT NULL,
    "capacidad_total_litros" INTEGER NOT NULL,
    "observaciones" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "sitios_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "sitios" ADD CONSTRAINT "sitios_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Escrito a mano: Prisma no declara índices sobre expresiones. El nombre (sin
-- distinguir mayúsculas) es único dentro de cada cliente, entre los sitios no eliminados.
CREATE UNIQUE INDEX "sitios_cliente_id_nombre_unico" ON "sitios" ("cliente_id", lower("nombre")) WHERE ("eliminado_en" IS NULL);
