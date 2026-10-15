-- CreateTable
CREATE TABLE "pagos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "egreso_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "importe_centavos" BIGINT NOT NULL,
    "importe_moneda" TEXT NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "salida_centavos" BIGINT NOT NULL,
    "salida_moneda" TEXT NOT NULL,
    "cambio_numerador" BIGINT,
    "cambio_denominador" BIGINT,
    "cambio_fuente" TEXT,
    "observaciones" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" JSONB NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" JSONB,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pagos_egreso_id_idx" ON "pagos"("egreso_id");

-- CreateIndex
CREATE INDEX "pagos_cuenta_id_idx" ON "pagos"("cuenta_id");

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_egreso_id_fkey" FOREIGN KEY ("egreso_id") REFERENCES "egresos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un pago es siempre de un importe mayor que cero.
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_importe_positivo" CHECK ("importe_centavos" > 0);

-- Mientras haya pagos vigentes, su cuenta no se da de baja y su egreso no se da de baja,
-- ni cambia de moneda, ni baja de lo ya pagado. El molde de ABM no conoce los pagos: lo
-- garantiza la base, también ante dos pedidos a la vez.
CREATE FUNCTION "cuentas_con_pagos_vigentes"() RETURNS trigger AS $$
BEGIN
  IF OLD."eliminado_en" IS NULL AND NEW."eliminado_en" IS NOT NULL
     AND EXISTS (SELECT 1 FROM "pagos" WHERE "cuenta_id" = OLD."id" AND "eliminado_en" IS NULL) THEN
    RAISE EXCEPTION 'pagos_vigentes_baja' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "cuentas_con_pagos_vigentes" BEFORE UPDATE ON "cuentas"
  FOR EACH ROW EXECUTE FUNCTION "cuentas_con_pagos_vigentes"();

CREATE FUNCTION "egresos_con_pagos_vigentes"() RETURNS trigger AS $$
DECLARE
  pagado BIGINT;
BEGIN
  SELECT COALESCE(SUM("importe_centavos"), 0) INTO pagado
    FROM "pagos" WHERE "egreso_id" = OLD."id" AND "eliminado_en" IS NULL;
  IF pagado = 0 THEN
    RETURN NEW;
  END IF;
  IF OLD."eliminado_en" IS NULL AND NEW."eliminado_en" IS NOT NULL THEN
    RAISE EXCEPTION 'pagos_vigentes_baja' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."importe_moneda" <> OLD."importe_moneda" THEN
    RAISE EXCEPTION 'pagos_vigentes_moneda' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."importe_centavos" < pagado THEN
    RAISE EXCEPTION 'pagos_vigentes_importe' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "egresos_con_pagos_vigentes" BEFORE UPDATE ON "egresos"
  FOR EACH ROW EXECUTE FUNCTION "egresos_con_pagos_vigentes"();
