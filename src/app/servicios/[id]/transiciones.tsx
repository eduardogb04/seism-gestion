/**
 * Los cambios de etapa que puede pedir la persona (los que dice
 * `servicio.transiciones`, F3-01): un botón por cada uno, que abre una ventana
 * de confirmación con la nota o el motivo. Recién ahí se llama a la acción.
 */

import type { DetalleDeServicio } from "../../../casos-uso/servicios/servicios.ts";
import { Boton, clasesDeBoton } from "../../_ui/boton.tsx";
import { CampoTexto } from "../../_ui/campo-texto.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { Ventana } from "../../_ui/ventana.tsx";
import { cambiarEstadoDeServicio } from "../acciones.ts";

export function Transiciones({
  servicio: { transiciones },
  ruta,
}: {
  readonly servicio: DetalleDeServicio;
  readonly ruta: string;
}) {
  return transiciones.length === 0 ? null : (
    <section
      aria-label="Cambiar de etapa"
      className="mt-4 flex flex-wrap gap-2"
    >
      {transiciones.map(({ valor, etiqueta }) => (
        <Enlace
          key={valor}
          href={`${ruta}?pasar=${valor}`}
          scroll={false}
          className={clasesDeBoton("secundario")}
        >
          {etiqueta}
        </Enlace>
      ))}
    </section>
  );
}

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
