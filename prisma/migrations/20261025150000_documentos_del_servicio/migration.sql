-- Los documentos de alcance de un servicio (F5-01, ADR 0047).

-- CreateTable
CREATE TABLE "servicios_documentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "servicio_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "servicios_documentos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "servicios_documentos" ADD CONSTRAINT "servicios_documentos_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_documentos" ADD CONSTRAINT "servicios_documentos_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
