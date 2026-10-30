import { sesionExigida } from "../../../(auth)/sesion-actual.ts";
import { PaginaDeEtapa, type PropsDeEtapa } from "../panel.tsx";

export default async function PanelSalida(props: PropsDeEtapa) {
  const sesion = await sesionExigida();
  return (
    <PaginaDeEtapa {...props} segmento="salida" rol={sesion.usuario.rol} />
  );
}
