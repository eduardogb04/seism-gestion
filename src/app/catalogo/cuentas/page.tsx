import { CUENTAS } from "../../../casos-uso/abm/cuentas.ts";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import { PaginaListado, type PropsListado } from "../_abm/paginas.tsx";

export default async function Cuentas(props: PropsListado) {
  const sesion = await sesionExigida();
  return (
    <PaginaListado
      bajada="Las cuentas bancarias y cajas donde entra y sale la plata."
      definicion={CUENTAS}
      sesion={sesion}
      {...props}
    />
  );
}
