import { GRUPOS } from "../../../../casos-uso/abm/grupos.ts";
import { sesionExigida } from "../../../(auth)/sesion-actual.ts";
import { PaginaEdicion, type PropsDeRegistro } from "../../_abm/paginas.tsx";

export default async function EdicionDeGrupo(props: PropsDeRegistro) {
  const sesion = await sesionExigida();
  return <PaginaEdicion definicion={GRUPOS} sesion={sesion} {...props} />;
}
