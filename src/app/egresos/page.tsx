import { Plus } from "lucide-react";
import { EGRESOS } from "../../casos-uso/abm/egresos.ts";
import { EncabezadoDePlata } from "../_plata/encabezado-de-plata.tsx";
import { clasesDeBoton } from "../_ui/boton.tsx";
import { Enlace } from "../_ui/enlace-next.ts";
import { sesionExigida } from "../(auth)/sesion-actual.ts";
import { PaginaListado, type PropsListado } from "../catalogo/_abm/paginas.tsx";
import { pagoRapido } from "./pago-rapido.tsx";

export default async function Egresos(props: PropsListado) {
  const sesion = await sesionExigida();
  const puedeEscribir = EGRESOS.rolesQueEscriben.includes(sesion.usuario.rol);
  return (
    <PaginaListado
      definicion={EGRESOS}
      sesion={sesion}
      extras={pagoRapido}
      encabezado={
        <EncabezadoDePlata
          activa="egresos"
          accion={
            puedeEscribir ? (
              <Enlace
                href="/egresos?nuevo=1"
                scroll={false}
                className={clasesDeBoton("primario")}
              >
                <Plus aria-hidden="true" />
                Registrar egreso
              </Enlace>
            ) : undefined
          }
        />
      }
      {...props}
    />
  );
}
