import { sesionExigida } from "../../../(auth)/sesion-actual.ts";
import { PaginaDeEtapa, type PropsDeEtapa } from "../panel.tsx";

export default async function PanelAdjudicado(props: PropsDeEtapa) {
  const sesion = await sesionExigida();
  return (
    <PaginaDeEtapa {...props} segmento="adjudicado" rol={sesion.usuario.rol} />
  );
}
