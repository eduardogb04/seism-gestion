import { GRUPOS } from "../../../../../casos-uso/abm/grupos.ts";
import { sesionExigida } from "../../../../(auth)/sesion-actual.ts";
import { PaginaBaja, type PropsDeRegistro } from "../../../_abm/paginas.tsx";

export default async function BajaDeGrupo(props: PropsDeRegistro) {
  const sesion = await sesionExigida();
  return <PaginaBaja definicion={GRUPOS} sesion={sesion} {...props} />;
}
