import { TIPOS_DE_SERVICIO } from "../../../casos-uso/abm/tipos-de-servicio.ts";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import { PaginaListado, type PropsListado } from "../_abm/paginas.tsx";

export default async function TiposDeServicio(props: PropsListado) {
  const sesion = await sesionExigida();
  return (
    <PaginaListado definicion={TIPOS_DE_SERVICIO} sesion={sesion} {...props} />
  );
}
