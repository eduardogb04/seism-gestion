import { SITIOS } from "../../../casos-uso/abm/sitios.ts";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import { PaginaListado, type PropsListado } from "../_abm/paginas.tsx";

export default async function Sitios(props: PropsListado) {
  const sesion = await sesionExigida();
  return (
    <PaginaListado
      bajada="Los lugares donde se presta el servicio, con sus tanques y su capacidad."
      definicion={SITIOS}
      sesion={sesion}
      {...props}
    />
  );
}
