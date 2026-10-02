-- CreateTable
CREATE TABLE "centros_costo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "clase" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "centros_costo_pkey" PRIMARY KEY ("id")
);

-- Escrito a mano: Prisma no declara índices sobre expresiones. El nombre (sin
-- distinguir mayúsculas) es único entre los centros de costo no eliminados.
CREATE UNIQUE INDEX "centros_costo_nombre_unico" ON "centros_costo" (lower("nombre")) WHERE ("eliminado_en" IS NULL);
