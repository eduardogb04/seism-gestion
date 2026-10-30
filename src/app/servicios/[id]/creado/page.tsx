import { sesionExigida } from "../../../(auth)/sesion-actual.ts";
import { PaginaDeEtapa, type PropsDeEtapa } from "../panel.tsx";

export default async function PanelCreado(props: PropsDeEtapa) {
  const sesion = await sesionExigida();
  return (
    <PaginaDeEtapa {...props} segmento="creado" rol={sesion.usuario.rol} />
  );
}
