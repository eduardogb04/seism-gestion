-- CreateTable
CREATE TABLE "servicios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "cliente_id" UUID NOT NULL,
    "tipo_servicio_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "modalidad" TEXT NOT NULL,
    "responsable_id" UUID NOT NULL,
    "fecha_pedido" DATE NOT NULL,
    "vigencia_desde" DATE,
    "vigencia_hasta" DATE,
    "observaciones" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios_eventos" (
    "servicio_id" UUID NOT NULL,
    "posicion" INTEGER NOT NULL,
    "de" TEXT,
    "a" TEXT NOT NULL,
    "en" TIMESTAMPTZ(3) NOT NULL,
    "actor" JSONB NOT NULL,
    "nota" TEXT,

    CONSTRAINT "servicios_eventos_pkey" PRIMARY KEY ("servicio_id","posicion")
);

-- CreateTable
CREATE TABLE "servicios_sitios" (
    "servicio_id" UUID NOT NULL,
    "sitio_id" UUID NOT NULL,

    CONSTRAINT "servicios_sitios_pkey" PRIMARY KEY ("servicio_id","sitio_id")
);

-- CreateTable
CREATE TABLE "secuencias" (
    "prefijo" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL,

    CONSTRAINT "secuencias_pkey" PRIMARY KEY ("prefijo","anio")
);

-- CreateIndex
CREATE UNIQUE INDEX "servicios_codigo_key" ON "servicios"("codigo");

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_tipo_servicio_id_fkey" FOREIGN KEY ("tipo_servicio_id") REFERENCES "tipos_servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_eventos" ADD CONSTRAINT "servicios_eventos_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_sitios" ADD CONSTRAINT "servicios_sitios_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_sitios" ADD CONSTRAINT "servicios_sitios_sitio_id_fkey" FOREIGN KEY ("sitio_id") REFERENCES "sitios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
