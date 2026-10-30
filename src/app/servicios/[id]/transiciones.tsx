/**
 * La confirmación de un cambio de etapa que pide la persona (F3-01): una
 * ventana con la nota o el motivo. Recién ahí se llama a la acción. Los botones
 * que la abren están en la barra de acciones de cada panel.
 */

import type { DetalleDeServicio } from "../../../casos-uso/servicios/servicios.ts";
import { Boton } from "../../_ui/boton.tsx";
import { CampoTexto } from "../../_ui/campo-texto.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { cambiarEstadoDeServicio } from "../acciones.ts";

export function VentanaDeTransicion({
  servicio: { id, transiciones },
  destino,
  rutaAlCerrar,
}: {
  readonly servicio: DetalleDeServicio;
  readonly destino: string;
  readonly rutaAlCerrar: string;
}) {
  const opcion = transiciones.find(({ valor }) => valor === destino);
  return opcion === undefined ? null : (
    <Ventana titulo={opcion.etiqueta} rutaAlCerrar={rutaAlCerrar}>
      <form
        action={cambiarEstadoDeServicio.bind(null, id)}
        className="flex flex-col gap-3"
      >
        <CampoTexto
          etiqueta="Nota o motivo"
          type="text"
          name="nota"
          maxLength={500}
        />
        <div>
          <Boton
            variante="primario"
            type="submit"
            name="a"
            value={opcion.valor}
          >
            Confirmar
          </Boton>
        </div>
      </form>
    </Ventana>
  );
}
