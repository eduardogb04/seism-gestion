-- CreateEnum
CREATE TYPE "resultado_corrida" AS ENUM ('ok', 'error');

-- CreateTable
CREATE TABLE "corridas_worker" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job" TEXT NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3),
    "resultado" "resultado_corrida",
    "detalle" TEXT,

    CONSTRAINT "corridas_worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fallidos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "origen" TEXT NOT NULL,
    "codigo_error" TEXT NOT NULL,
    "carga" JSONB NOT NULL,
    "intentos" INTEGER NOT NULL,
    "proximo_intento" TIMESTAMPTZ(3),
    "resuelto_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fallidos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "corridas_worker_job_inicio_idx" ON "corridas_worker"("job", "inicio" DESC);

-- CreateIndex
CREATE INDEX "fallidos_pendientes_idx" ON "fallidos"("resuelto_en") WHERE (resuelto_en IS NULL);
