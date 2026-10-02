import { SITIOS } from "../../../casos-uso/abm/sitios.ts";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import { PaginaListado, type PropsListado } from "../_abm/paginas.tsx";

export default async function Sitios(props: PropsListado) {
  const sesion = await sesionExigida();
  return <PaginaListado definicion={SITIOS} sesion={sesion} {...props} />;
}
