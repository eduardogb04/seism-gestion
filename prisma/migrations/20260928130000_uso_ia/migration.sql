-- CreateTable
CREATE TABLE "uso_ia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "en" TIMESTAMPTZ(3) NOT NULL,
    "perfil" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "version_prompt" TEXT NOT NULL,
    "costo_usd" DECIMAL(14,6) NOT NULL,
    "tokens" INTEGER NOT NULL,
    "propuesta" JSONB NOT NULL,
    "propuesta_valida" BOOLEAN NOT NULL,
    "decision_humana" TEXT,
    "decidido_por" UUID,
    "decidido_en" TIMESTAMPTZ(3),

    CONSTRAINT "uso_ia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uso_ia_en_idx" ON "uso_ia"("en");
