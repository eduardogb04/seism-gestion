-- CreateTable
CREATE TABLE "tipos_servicio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "modalidad" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "tipos_servicio_pkey" PRIMARY KEY ("id")
);

-- Escrito a mano: Prisma no declara índices sobre expresiones. El nombre (sin
-- distinguir mayúsculas) es único entre los tipos de servicio no eliminados.
CREATE UNIQUE INDEX "tipos_servicio_nombre_unico" ON "tipos_servicio" (lower("nombre")) WHERE ("eliminado_en" IS NULL);
