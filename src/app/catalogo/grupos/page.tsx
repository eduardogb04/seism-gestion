import { GRUPOS } from "../../../casos-uso/abm/grupos.ts";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import { PaginaListado, type PropsListado } from "../_abm/paginas.tsx";

export default async function Grupos(props: PropsListado) {
  const sesion = await sesionExigida();
  return <PaginaListado definicion={GRUPOS} sesion={sesion} {...props} />;
}
