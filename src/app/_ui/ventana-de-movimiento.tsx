/**
 * Las ventanas de pagar un egreso y de cobrar una factura (F3-07): la misma
 * ventana se abre desde el listado, desde el detalle y, la de cobro, desde la
 * pantalla del servicio. Muestran lo que falta (el monto pendiente) y, al
 * guardar o cerrar, vuelven a `rutaAlCerrar`, que trae la vista de quien la abrió.
 */

import type { ReactNode } from "react";
import { ACEPTA } from "../../casos-uso/documentos/documentos.ts";
import {
  codigoDeError,
  pantallaDeCodigo,
} from "../../casos-uso/sesion/errores.ts";
import { armado } from "../../infraestructura/arranque/armado.ts";
import { registrarPagoDeEgreso } from "../egresos/acciones.ts";
import { cobrarFactura } from "../servicios/acciones.ts";
import { ErrorEnPantalla } from "./error-en-pantalla.tsx";
import { FormularioAbm } from "./formulario-abm.tsx";
import { Ventana } from "./ventana.tsx";

/** Lo que se ve dentro de la ventana, o el error de un registro que ya no existe. */
async function ventanaCon(
  titulo: string,
  rutaAlCerrar: string,
  contenido: () => Promise<ReactNode>,
) {
  let dentro: ReactNode;
  try {
    dentro = await contenido();
  } catch (fallo) {
    const codigo = codigoDeError(fallo);
    if (codigo === null) {
      throw fallo;
    }
    dentro = <ErrorEnPantalla error={pantallaDeCodigo(codigo)} />;
  }
  return (
    <Ventana titulo={titulo} rutaAlCerrar={rutaAlCerrar}>
      {dentro}
    </Ventana>
  );
}

export function VentanaDePago({
  egresoId,
  rutaAlCerrar,
}: {
  readonly egresoId: string;
  readonly rutaAlCerrar: string;
}) {
  return ventanaCon("Registrar pago", rutaAlCerrar, async () => {
    const { concepto, saldo, saldado, campos, cuentas } =
      await armado().pagos.detalle(egresoId);
    return saldado ? (
      <p>El egreso «{concepto}» ya está pagado.</p>
    ) : (
      <>
        <p className="mb-4">
          Egreso «{concepto}»: falta pagar{" "}
          <strong data-pendiente>{saldo}</strong>.
        </p>
        <FormularioAbm
          accion={registrarPagoDeEgreso.bind(null, egresoId, rutaAlCerrar)}
          campos={campos}
          elegibles={{ cuentaId: cuentas }}
          inicial={{ escrito: {}, errores: {} }}
          enviar={{ texto: "Registrar pago", variante: "primario" }}
          rutaAlCancelar={rutaAlCerrar}
        />
      </>
    );
  });
}

export function VentanaDeCobro({
  facturaId,
  rutaAlCerrar,
}: {
  readonly facturaId: string;
  readonly rutaAlCerrar: string;
}) {
  return ventanaCon("Cobrar factura", rutaAlCerrar, async () => {
    const { numero, saldo, campos, elegibles, escrito } =
      await armado().cobros.formulario(facturaId);
    return (
      <>
        <p className="mb-4">
          Factura {numero}: falta cobrar <strong data-pendiente>{saldo}</strong>
          .
        </p>
        <FormularioAbm
          accion={cobrarFactura.bind(null, facturaId, rutaAlCerrar)}
          campos={campos}
          elegibles={elegibles}
          inicial={{ escrito, errores: {} }}
          archivo={{
            nombre: "archivo",
            etiqueta: "Documento de la orden de pago (opcional)",
            accept: ACEPTA,
          }}
          enviar={{ texto: "Cobrar", variante: "primario" }}
          rutaAlCancelar={rutaAlCerrar}
        />
      </>
    );
  });
}
