-- El recorrido por etapas (F3-01, ADR 0039). El estado de un servicio no es una
-- columna: es el último evento de `servicios_eventos`. Se renombran los dos
-- estados que cambian de nombre, en las dos columnas; el historial queda entero
-- (ningún evento se agrega ni se borra) y el resto de los valores, igual.
UPDATE "servicios_eventos" SET "de" = 'creado' WHERE "de" = 'solicitado';
UPDATE "servicios_eventos" SET "a" = 'creado' WHERE "a" = 'solicitado';
UPDATE "servicios_eventos" SET "de" = 'en_ejecucion' WHERE "de" = 'vigente';
UPDATE "servicios_eventos" SET "a" = 'en_ejecucion' WHERE "a" = 'vigente';

-- CreateTable
CREATE TABLE "servicios_sucesos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "servicio_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "texto" TEXT NOT NULL,
    "motivo_anulacion" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "servicios_sucesos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "servicios_sucesos_servicio_id_idx" ON "servicios_sucesos"("servicio_id");

-- AddForeignKey
ALTER TABLE "servicios_sucesos" ADD CONSTRAINT "servicios_sucesos_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
