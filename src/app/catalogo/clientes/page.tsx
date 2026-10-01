import { CLIENTES } from "../../../casos-uso/abm/clientes.ts";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import { PaginaListado, type PropsListado } from "../_abm/paginas.tsx";

export default async function Clientes(props: PropsListado) {
  const sesion = await sesionExigida();
  return <PaginaListado definicion={CLIENTES} sesion={sesion} {...props} />;
}
