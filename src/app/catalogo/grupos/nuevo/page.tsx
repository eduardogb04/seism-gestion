import { GRUPOS } from "../../../../casos-uso/abm/grupos.ts";
import { sesionExigida } from "../../../(auth)/sesion-actual.ts";
import { PaginaAlta } from "../../_abm/paginas.tsx";

export default async function AltaDeGrupo() {
  const sesion = await sesionExigida();
  return <PaginaAlta definicion={GRUPOS} sesion={sesion} />;
}
