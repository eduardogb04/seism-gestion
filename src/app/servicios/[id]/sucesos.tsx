/**
 * La columna *Observaciones y sucesos* del servicio (F3-01, ADR 0039; F6-01):
 * el más nuevo arriba, cada uno con la etiqueta de su tipo, y la carga
 * (`?suceso=1`) y la anulación con su motivo (`?anularSuceso=<id>`) como
 * ventanas sobre el panel de la etapa actual, que es quien las dibuja: el
 * layout no recibe los parámetros de la dirección.
 */

import { MessagesSquare } from "lucide-react";
import {
  CAMPOS_DE_ANULACION,
  type OrigenDeAnulacion,
  type SucesoListado,
} from "../../../casos-uso/servicios/sucesos.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { anularSuceso, registrarSuceso } from "../acciones.ts";

/** La carga de un suceso, de un servicio o (sin `servicioId`) suelta del cliente. */
export function VentanaDeCarga({
  clienteId,
  servicioId,
  rutaAlCerrar,
}: {
  readonly clienteId: string;
  readonly servicioId: string | null;
  readonly rutaAlCerrar: string;
}) {
  const { campos, escrito } = armado().sucesos.formulario();
  return (
    <Ventana titulo="Nuevo suceso" rutaAlCerrar={rutaAlCerrar}>
      <FormularioAbm
        accion={registrarSuceso.bind(null, clienteId, servicioId)}
        campos={campos}
        elegibles={{}}
        inicial={{ escrito, errores: {} }}
        enviar={{ texto: "Cargar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

/** La anulación de un suceso, de un servicio o (con `clienteId`) suelta del cliente. */
export function VentanaDeAnulacion({
  origen,
  suceso,
  rutaAlCerrar,
}: {
  readonly origen: OrigenDeAnulacion;
  readonly suceso: Pick<SucesoListado, "id" | "fecha"> | undefined;
  readonly rutaAlCerrar: string;
}) {
  return (
    <Ventana titulo="Anular suceso" rutaAlCerrar={rutaAlCerrar}>
      {suceso === undefined ? (
        <ErrorEnPantalla error={pantallaDeCodigo("DOM-0009")} />
      ) : (
        <>
          <p className="mb-4">
            Anulás el suceso del {suceso.fecha}:{" "}
            {"servicioId" in origen
              ? "deja de verse, y queda con su motivo en la auditoría."
              : "sigue en la traza, tachado y con su motivo."}
          </p>
          <FormularioAbm
            accion={anularSuceso.bind(null, origen, suceso.id)}
            campos={CAMPOS_DE_ANULACION}
            elegibles={{}}
            inicial={{ escrito: {}, errores: {} }}
            enviar={{ texto: "Confirmar anulación", variante: "peligro" }}
            rutaAlCancelar={rutaAlCerrar}
          />
        </>
      )}
    </Ventana>
  );
}

/** `ruta`: la del panel de la etapa actual, donde se abren las ventanas. */
export async function ColumnaDeSucesos({
  servicioId,
  ruta,
  puedeEscribir,
}: {
  readonly servicioId: string;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
}) {
  const sucesos = await armado().sucesos.listar(servicioId);
  return (
    <section className="rounded border border-borde bg-superficie p-4 shadow-sm dark:shadow-none">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <MessagesSquare
          aria-hidden="true"
          className="size-5 text-texto-suave"
        />
        Observaciones y sucesos
      </h2>
      {puedeEscribir ? (
        <p className="mt-3">
          <Enlace
            href={`${ruta}?suceso=1`}
            scroll={false}
            className={clasesDeBoton("secundario")}
          >
            Nuevo suceso
          </Enlace>
        </p>
      ) : null}
      {sucesos.length === 0 ? (
        <p className="mt-3 text-texto-suave">
          Todavía no hay sucesos cargados.
        </p>
      ) : (
        <ol className="mt-3">
          {sucesos.map((suceso) => (
            <li
              key={suceso.id}
              data-suceso
              className="border-t border-borde py-3 first:border-t-0"
            >
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-texto-suave">
                <span>
                  {suceso.autor} · {suceso.fecha}
                </span>
                <span
                  data-tipo-de-suceso
                  className="ml-auto rounded-full bg-superficie-alta px-2 text-xs font-semibold text-texto"
                >
                  {suceso.tipo}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-line break-words">
                {suceso.texto}
              </p>
              {puedeEscribir ? (
                <Enlace
                  href={`${ruta}?anularSuceso=${suceso.id}`}
                  scroll={false}
                  className="text-sm"
                >
                  Anular
                </Enlace>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
