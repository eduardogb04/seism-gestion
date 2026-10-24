import { EGRESOS } from "../../casos-uso/abm/egresos.ts";
import { armado } from "../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../_ui/boton.tsx";
import { Enlace } from "../_ui/enlace-next.ts";
import { enlace, vistaDe } from "../_ui/listado-abm.tsx";
import { VentanaDePago } from "../_ui/ventana-de-movimiento.tsx";
import { sesionExigida } from "../(auth)/sesion-actual.ts";
import {
  type ExtrasDelListado,
  PaginaListado,
  type PropsListado,
} from "../catalogo/_abm/paginas.tsx";

/** «Registrar pago» en cada egreso que todavía debe algo, en una ventana sobre este mismo listado (`?pagar=<id>`, F3-07). */
const pagoRapido: ExtrasDelListado = async (listado, parametros) => {
  const pendientes = new Set(await armado().pagos.pendientes());
  const aPagar = parametros.pagar;
  return {
    acciones: (id, vista) =>
      pendientes.has(id) ? (
        <Enlace
          href={`${enlace(EGRESOS.ruta, vista)}&pagar=${id}`}
          scroll={false}
          className={clasesDeBoton("primario")}
        >
          Registrar pago
        </Enlace>
      ) : null,
    ventana:
      typeof aPagar === "string" ? (
        <VentanaDePago
          egresoId={aPagar}
          rutaAlCerrar={enlace(EGRESOS.ruta, vistaDe(listado))}
        />
      ) : null,
  };
};

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
