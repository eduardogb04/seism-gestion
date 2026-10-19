/**
 * El tipo de cambio de una orden de compra o una factura (F3-04): lo que se ve
 * en su fila (el valor, o el aviso si es en dólares y no lo tiene) y la ventana
 * para completarlo o cambiarlo. En pesos no se muestra nada.
 */

import type { CamposAbm, Escrito } from "../../../casos-uso/abm/definicion.ts";
import type { CambioListado } from "../../../casos-uso/servicios/comprobantes.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import {
  type EstadoFormulario,
  FormularioAbm,
} from "../../_ui/formulario-abm.tsx";
import { Ventana } from "../../_ui/ventana.tsx";

export function CambioDelComprobante({
  cambio,
}: {
  readonly cambio: CambioListado;
}) {
  if (cambio === null) {
    return null;
  }
  return cambio.falta ? (
    <span role="status" className="font-medium text-aviso">
      {cambio.texto}
    </span>
  ) : (
    <span>{cambio.texto}</span>
  );
}

/** El texto del enlace de la fila que abre la ventana; solo hay enlace si el comprobante es en dólares. */
export function textoDelEnlaceDeCambio(cambio: CambioListado): string | null {
  if (cambio === null) {
    return null;
  }
  return cambio.falta ? "Cargar tipo de cambio" : "Cambiar tipo de cambio";
}

export function VentanaDelCambio({
  que,
  formulario,
  accion,
  rutaAlCerrar,
}: {
  /** Qué se está completando: «la orden de compra OC-1». */
  readonly que: string;
  /** `undefined`: el comprobante no está (o ya se anuló). */
  readonly formulario:
    | { readonly campos: CamposAbm; readonly escrito: Escrito }
    | undefined;
  readonly accion: (
    previo: EstadoFormulario,
    formulario: FormData,
  ) => Promise<EstadoFormulario>;
  readonly rutaAlCerrar: string;
}) {
  return (
    <Ventana titulo="Tipo de cambio" rutaAlCerrar={rutaAlCerrar}>
      {formulario === undefined ? (
        <ErrorEnPantalla error={pantallaDeCodigo("DOM-0009")} />
      ) : (
        <>
          <p className="mb-4">Tipo de cambio de {que}.</p>
          <FormularioAbm
            accion={accion}
            campos={formulario.campos}
            elegibles={{}}
            inicial={{ escrito: formulario.escrito, errores: {} }}
            enviar={{ texto: "Guardar", variante: "primario" }}
            rutaAlCancelar={rutaAlCerrar}
          />
        </>
      )}
    </Ventana>
  );
}
