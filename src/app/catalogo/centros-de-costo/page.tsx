import { CENTROS_DE_COSTO } from "../../../casos-uso/abm/centros-de-costo.ts";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import { PaginaListado, type PropsListado } from "../_abm/paginas.tsx";

export default async function CentrosDeCosto(props: PropsListado) {
  const sesion = await sesionExigida();
  return (
    <PaginaListado definicion={CENTROS_DE_COSTO} sesion={sesion} {...props} />
  );
}
