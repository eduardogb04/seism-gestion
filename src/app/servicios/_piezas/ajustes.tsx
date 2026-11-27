/**
 * Los ajustes de un servicio en «Finalizado» (F6-03, ADR 0050): los botones
 * «Nota de crédito», «Nota de débito» y «Factura adicional», la lista de los
 * vigentes y sus ventanas sobre la misma pantalla: la carga (`?ajuste=<tipo>`)
 * y la anulación con motivo (`?anularAjuste=<id>`). `Ajustes` recibe los datos y
 * las acciones por props; `AjustesDelServicio` los trae para un servicio.
 */

import type { CamposAbm, Escrito } from "../../../casos-uso/abm/definicion.ts";
import { ACEPTA } from "../../../casos-uso/documentos/documentos.ts";
import {
  AJUSTES,
  type Ajuste,
  type AjusteListado,
} from "../../../casos-uso/servicios/ajustes.ts";
import { CAMPOS_DE_ANULACION } from "../../../casos-uso/servicios/sucesos.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import {
  type EstadoFormulario,
  FormularioAbm,
} from "../../_ui/formulario-abm.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { Parte } from "../[id]/_molde/parte.tsx";
import { IvaEnVivo } from "../[id]/iva-en-vivo.tsx";
import { anularAjuste, cargarAjuste } from "../acciones.ts";

type Accion = (
  previo: EstadoFormulario,
  formulario: FormData,
) => Promise<EstadoFormulario>;

const NOMBRES: Readonly<Record<Ajuste, string>> = {
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
  adicional: "Factura adicional",
};

const CABECERAS = ["Tipo", "Número", "Fecha", "Asociado a", "Total con IVA"];

export function Ajustes({
  enSeccion,
  ruta,
  puedeEscribir,
  ajustes,
  abierto,
  aAnular,
  cargar,
  anular,
}: {
  /** Dentro de una `Seccion` del molde: sin título propio. */
  readonly enSeccion?: boolean | undefined;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  /** Las notas y facturas adicionales vigentes. */
  readonly ajustes: readonly AjusteListado[];
  /** El formulario de la ventana de carga abierta, o `null`. */
  readonly abierto: {
    readonly ajuste: Ajuste;
    readonly campos: CamposAbm;
    readonly escrito: Escrito;
  } | null;
  /** El que se pidió anular; `undefined` si no está entre los vigentes, `null` si no se pidió. */
  readonly aAnular: AjusteListado | undefined | null;
  readonly cargar: (ajuste: Ajuste) => Accion;
  readonly anular: (id: string) => Accion;
}) {
  return (
    <Parte enSeccion={enSeccion} titulo="Notas de crédito y de débito">
      {puedeEscribir ? (
        <p className="mb-3 flex flex-wrap gap-3">
          {/* La factura adicional sale de un recargo aprobado (R5), no de un botón suelto. */}
          {AJUSTES.filter((ajuste) => ajuste !== "adicional").map((ajuste) => (
            <Enlace
              key={ajuste}
              href={`${ruta}?ajuste=${ajuste}`}
              scroll={false}
              className={clasesDeBoton("secundario")}
              data-carga="ajuste"
            >
              {NOMBRES[ajuste]}
            </Enlace>
          ))}
        </p>
      ) : null}
      {ajustes.length === 0 ? (
        <p>No hay notas ni facturas adicionales cargadas.</p>
      ) : (
        <Tabla
          cabeceras={puedeEscribir ? [...CABECERAS, "Acciones"] : CABECERAS}
        >
          {ajustes.map((ajuste) => (
            <tr key={ajuste.id}>
              <td>{ajuste.tipo}</td>
              <td>{ajuste.numero}</td>
              <td>{ajuste.fecha}</td>
              <td>{ajuste.asociado}</td>
              <td>{ajuste.total}</td>
              {puedeEscribir ? (
                <td>
                  <Enlace
                    href={`${ruta}?anularAjuste=${ajuste.id}`}
                    scroll={false}
                    data-carga="ajuste"
                  >
                    Anular
                  </Enlace>
                </td>
              ) : null}
            </tr>
          ))}
        </Tabla>
      )}
      {abierto === null ? null : (
        <Ventana titulo={NOMBRES[abierto.ajuste]} rutaAlCerrar={ruta}>
          <FormularioAbm
            accion={cargar(abierto.ajuste)}
            campos={abierto.campos}
            elegibles={{}}
            inicial={{ escrito: abierto.escrito, errores: {} }}
            archivo={{
              nombre: "archivo",
              etiqueta: "Documento (opcional)",
              accept: ACEPTA,
            }}
            enviar={{ texto: "Cargar", variante: "primario" }}
            rutaAlCancelar={ruta}
          >
            {abierto.ajuste === "nota_credito" ? null : <IvaEnVivo />}
          </FormularioAbm>
        </Ventana>
      )}
      {aAnular === null ? null : (
        <Ventana titulo="Anular ajuste" rutaAlCerrar={ruta}>
          {aAnular === undefined ? (
            <ErrorEnPantalla error={pantallaDeCodigo("DOM-0009")} />
          ) : (
            <>
              <p className="mb-4">
                Confirmá que anulás la {aAnular.tipo.toLowerCase()}{" "}
                {aAnular.numero}.
              </p>
              <FormularioAbm
                accion={anular(aAnular.id)}
                campos={CAMPOS_DE_ANULACION}
                elegibles={{}}
                inicial={{ escrito: {}, errores: {} }}
                enviar={{ texto: "Confirmar anulación", variante: "peligro" }}
                rutaAlCancelar={ruta}
              />
            </>
          )}
        </Ventana>
      )}
    </Parte>
  );
}

export async function AjustesDelServicio({
  enSeccion,
  servicioId,
  ruta,
  puedeEscribir,
  parametros,
}: {
  readonly enSeccion?: boolean | undefined;
  readonly servicioId: string;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
}) {
  // Sin factura no hay notas de crédito ni de débito (R8).
  const { interno } = await armado().ajustesDeFacturacion.listar(servicioId);
  if (interno) {
    return null;
  }
  const ajustes = await armado().ajustes.listar(servicioId);
  const pedido = AJUSTES.find(
    (ajuste) => ajuste !== "adicional" && ajuste === parametros.ajuste,
  );
  const aAnular = parametros.anularAjuste;
  return (
    <Ajustes
      enSeccion={enSeccion}
      ruta={ruta}
      puedeEscribir={puedeEscribir}
      ajustes={ajustes}
      abierto={
        puedeEscribir && pedido !== undefined
          ? {
              ajuste: pedido,
              ...(await armado().ajustes.formulario(servicioId, pedido)),
            }
          : null
      }
      aAnular={
        puedeEscribir && typeof aAnular === "string"
          ? ajustes.find(({ id }) => id === aAnular)
          : null
      }
      cargar={(ajuste) => cargarAjuste.bind(null, servicioId, ajuste)}
      anular={(id) => anularAjuste.bind(null, servicioId, id)}
    />
  );
}
