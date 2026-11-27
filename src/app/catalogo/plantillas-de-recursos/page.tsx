import { PLANTILLAS_DE_RECURSOS } from "../../../casos-uso/abm/plantillas-de-recursos.ts";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import { PaginaListado, type PropsListado } from "../_abm/paginas.tsx";

export default async function PlantillasDeRecursos(props: PropsListado) {
  const sesion = await sesionExigida();
  return (
    <PaginaListado
      bajada="Los recursos que se cargan solos al crear un servicio de cada tipo, o que se aplican a mano."
      definicion={PLANTILLAS_DE_RECURSOS}
      sesion={sesion}
      {...props}
    />
  );
}
