import { sesionExigida } from "../../../(auth)/sesion-actual.ts";
import { PaginaDeEtapa, type PropsDeEtapa } from "../panel.tsx";

export default async function PanelCotizado(props: PropsDeEtapa) {
  const sesion = await sesionExigida();
  return (
    <PaginaDeEtapa {...props} segmento="cotizado" rol={sesion.usuario.rol} />
  );
}
