-- CreateTable
CREATE TABLE "grupos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "observaciones" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "grupos_pkey" PRIMARY KEY ("id")
);

-- Escrito a mano: Prisma no declara índices sobre expresiones. El nombre es
-- único entre los grupos no eliminados, sin distinguir mayúsculas.
CREATE UNIQUE INDEX "grupos_nombre_unico" ON "grupos" (lower("nombre")) WHERE ("eliminado_en" IS NULL);
