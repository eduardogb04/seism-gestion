import { EGRESOS } from "../../casos-uso/abm/egresos.ts";
import { sesionExigida } from "../(auth)/sesion-actual.ts";
import { PaginaListado, type PropsListado } from "../catalogo/_abm/paginas.tsx";
import { pagoRapido } from "./pago-rapido.tsx";

export default async function Egresos(props: PropsListado) {
  const sesion = await sesionExigida();
  return (
    <PaginaListado
      definicion={EGRESOS}
      sesion={sesion}
      extras={pagoRapido}
      {...props}
    />
  );
}
