-- CreateTable
CREATE TABLE "cuentas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "observaciones" TEXT,
    "activa" BOOLEAN NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "cuentas_pkey" PRIMARY KEY ("id")
);

-- Escrito a mano: Prisma no declara índices sobre expresiones. El nombre (sin
-- distinguir mayúsculas) es único entre las cuentas no eliminadas.
CREATE UNIQUE INDEX "cuentas_nombre_unico" ON "cuentas" (lower("nombre")) WHERE ("eliminado_en" IS NULL);
