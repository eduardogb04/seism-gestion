-- CreateTable
CREATE TABLE "clientes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "razon_social" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "condicion_iva" TEXT NOT NULL,
    "domicilio" TEXT NOT NULL,
    "localidad" TEXT NOT NULL,
    "provincia" TEXT NOT NULL,
    "codigo_postal" TEXT NOT NULL,
    "es_cliente" BOOLEAN NOT NULL,
    "es_proveedor" BOOLEAN NOT NULL,
    "nombre_corto" TEXT,
    "grupo_id" UUID,
    "contacto_nombre" TEXT,
    "contacto_telefono" TEXT,
    "contacto_email" TEXT,
    "email_facturacion" TEXT,
    "observaciones" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Escrito a mano: Prisma no declara índices sobre expresiones. La razón social
-- (sin distinguir mayúsculas) y el CUIT son únicos entre los clientes no eliminados.
CREATE UNIQUE INDEX "clientes_razon_social_unico" ON "clientes" (lower("razon_social")) WHERE ("eliminado_en" IS NULL);
CREATE UNIQUE INDEX "clientes_cuit_unico" ON "clientes" (lower("cuit")) WHERE ("eliminado_en" IS NULL);
