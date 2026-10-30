import { sesionExigida } from "../../../(auth)/sesion-actual.ts";
import { PaginaDeEtapa, type PropsDeEtapa } from "../panel.tsx";

export default async function PanelEnEjecucion(props: PropsDeEtapa) {
  const sesion = await sesionExigida();
  return (
    <PaginaDeEtapa
      {...props}
      segmento="en-ejecucion"
      rol={sesion.usuario.rol}
    />
  );
}
