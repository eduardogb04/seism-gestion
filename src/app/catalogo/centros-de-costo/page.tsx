import { CENTROS_DE_COSTO } from "../../../casos-uso/abm/centros-de-costo.ts";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import { PaginaListado, type PropsListado } from "../_abm/paginas.tsx";

export default async function CentrosDeCosto(props: PropsListado) {
  const sesion = await sesionExigida();
  return (
    <PaginaListado
      bajada="A dónde se imputan los egresos para saber cuánto cuesta cada parte del negocio."
      definicion={CENTROS_DE_COSTO}
      sesion={sesion}
      {...props}
    />
  );
}
