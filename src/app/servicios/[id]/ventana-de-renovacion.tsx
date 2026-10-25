/**
 * La confirmación de cotizar la renovación de un vencimiento (F4-07), que se
 * abre sobre la pantalla del servicio y sobre el calendario (F4-08).
 */

import { Boton } from "../../_ui/boton.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { cotizarRenovacion } from "../acciones.ts";

export function VentanaDeRenovacion({
  servicioId,
  vencimientoId,
  detalle,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly vencimientoId: string;
  /** Qué vence y cuándo, ya escrito para mostrar. */
  readonly detalle: string;
  readonly rutaAlCerrar: string;
}) {
  return (
    <Ventana titulo="Cotizar renovación" rutaAlCerrar={rutaAlCerrar}>
      <p className="mb-3">{detalle}</p>
      <p className="mb-3">
        Se crea un servicio nuevo en «Creado», con el cliente, el tipo, los
        sitios y los camiones de este.
      </p>
      <form action={cotizarRenovacion.bind(null, servicioId, vencimientoId)}>
        <Boton variante="primario" type="submit">
          Confirmar
        </Boton>
      </form>
    </Ventana>
  );
}
