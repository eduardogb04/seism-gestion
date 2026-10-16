-- Mientras haya cobros vigentes, su cuenta no se da de baja (como con los pagos, F2-09). El molde de
-- ABM no conoce los cobros: lo garantiza la base, también ante dos pedidos a la vez (registrar un
-- cobro toma la fila de la cuenta con FOR SHARE). El mensaje distinto lo traduce el adaptador a DOM-0010.
CREATE FUNCTION "cuentas_con_cobros_vigentes"() RETURNS trigger AS $$
BEGIN
  IF OLD."eliminado_en" IS NULL AND NEW."eliminado_en" IS NOT NULL
     AND EXISTS (SELECT 1 FROM "cobros" WHERE "cuenta_id" = OLD."id" AND "eliminado_en" IS NULL) THEN
    RAISE EXCEPTION 'cobros_vigentes_baja' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "cuentas_con_cobros_vigentes" BEFORE UPDATE ON "cuentas"
  FOR EACH ROW EXECUTE FUNCTION "cuentas_con_cobros_vigentes"();
