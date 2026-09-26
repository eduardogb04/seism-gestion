-- Usuarios, sesiones y auditoría (F0-30, ADR 0024).
-- Generado con `npx prisma migrate diff --from-schema <schema de main> --to-schema
-- prisma/schema.prisma --script` y revisado a mano. Lo único agregado a mano es el CHECK
-- `usuarios_email_en_minusculas`: el índice único de `email` no distingue mayúsculas porque el
-- email se guarda siempre en minúsculas, y la base lo exige además del código (Prisma no modela
-- los CHECK: el diff contra `schema.prisma` no lo ve).

-- CreateEnum
CREATE TYPE "rol_usuario" AS ENUM ('administrador', 'operador');

-- CreateEnum
CREATE TYPE "estado_usuario" AS ENUM ('activo', 'revocado');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "nombre" TEXT,
    "rol" "rol_usuario" NOT NULL,
    "estado" "estado_usuario" NOT NULL DEFAULT 'activo',
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "usuarios_email_en_minusculas" CHECK ("email" = lower("email"))
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" TEXT NOT NULL,
    "usuario_id" UUID NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "ultimo_uso" TIMESTAMPTZ(3) NOT NULL,
    "agente" TEXT,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "actor" JSONB NOT NULL,
    "en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "sesiones_usuario_id_idx" ON "sesiones"("usuario_id");

-- CreateIndex
CREATE INDEX "auditoria_entidad_entidad_id_idx" ON "auditoria"("entidad", "entidad_id");

-- AddForeignKey
ALTER TABLE "configuracion" ADD CONSTRAINT "configuracion_actualizado_por_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

