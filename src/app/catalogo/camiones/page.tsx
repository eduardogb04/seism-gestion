import { CAMIONES } from "../../../casos-uso/abm/camiones.ts";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import { PaginaListado, type PropsListado } from "../_abm/paginas.tsx";

export default async function Camiones(props: PropsListado) {
  const sesion = await sesionExigida();
  return <PaginaListado definicion={CAMIONES} sesion={sesion} {...props} />;
}
