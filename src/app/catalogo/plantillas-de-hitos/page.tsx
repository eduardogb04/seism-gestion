import { PLANTILLAS_DE_HITOS } from "../../../casos-uso/abm/plantillas-de-hitos.ts";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import { PaginaListado, type PropsListado } from "../_abm/paginas.tsx";

export default async function PlantillasDeHitos(props: PropsListado) {
  const sesion = await sesionExigida();
  return (
    <PaginaListado
      definicion={PLANTILLAS_DE_HITOS}
      sesion={sesion}
      {...props}
    />
  );
}
