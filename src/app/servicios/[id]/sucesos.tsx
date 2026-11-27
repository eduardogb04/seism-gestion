/**
 * La *Actividad* del servicio (F3-01, ADR 0039; F6-01; FRONT_SPEC §5
 * `LineaDeTiempo`): una sola línea de tiempo con las observaciones y sucesos y
 * los cambios de estado, lo más nuevo arriba, con autor y tipo. La carga
 * (`?suceso=1`) y la anulación con su motivo (`?anularSuceso=<id>`) son
 * ventanas sobre el panel de la etapa actual, que es quien las dibuja: el
 * layout no recibe los parámetros de la dirección.
 */

import {
  Building2,
  type LucideIcon,
  MessageSquareText,
  Plus,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { ETIQUETAS_DE_ESTADO } from "../../../casos-uso/servicios/formulario.ts";
import type { CambioDeEstado } from "../../../casos-uso/servicios/servicios.ts";
import {
  CAMPOS_DE_ANULACION,
  type OrigenDeAnulacion,
  type SucesoDelServicio,
  type SucesoListado,
} from "../../../casos-uso/servicios/sucesos.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import type { EstadoServicio } from "../../../dominio/servicios/estados.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { cn } from "../../_ui/cn.ts";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { PuntoDeEtapa } from "../../_ui/etapa.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { anularSuceso, registrarSuceso } from "../acciones.ts";
import { Persona } from "./_molde/persona.tsx";

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
    <Ventana titulo="Nueva observación" rutaAlCerrar={rutaAlCerrar}>
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
    <Ventana titulo="¿Anular esta observación?" rutaAlCerrar={rutaAlCerrar}>
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

const ICONO_DE_TIPO: Readonly<Record<string, LucideIcon>> = {
  Hallazgo: TriangleAlert,
  "Aclaración del cliente": Building2,
};

const ETAPA_DE_ETIQUETA = new Map(
  (Object.entries(ETIQUETAS_DE_ESTADO) as [EstadoServicio, string][]).map(
    ([valor, etiqueta]) => [etiqueta, valor],
  ),
);

/** `dd/mm/aaaa[ hh:mm]` → `aaaammddhhmm`, para ordenar. */
function clave(fecha: string): string {
  const [dia = "", hora = "00:00"] = fecha.split(" ");
  const [d = "", m = "", a = ""] = dia.split("/");
  return `${a}${m}${d}${hora.replace(":", "")}`;
}

type Entrada =
  | {
      readonly es: "suceso";
      readonly orden: string;
      readonly suceso: SucesoDelServicio;
    }
  | {
      readonly es: "cambio";
      readonly orden: string;
      readonly cambio: CambioDeEstado;
    };

/** Sucesos (que traen solo el día) y cambios de estado, de lo más nuevo a lo más viejo. */
function lineaDeTiempo(
  sucesos: readonly SucesoDelServicio[],
  historial: readonly CambioDeEstado[],
): readonly Entrada[] {
  const entradas: Entrada[] = [
    ...sucesos.map((suceso) => ({
      es: "suceso" as const,
      // Al final del día: queda arriba de los cambios de ese mismo día.
      orden: `${clave(suceso.fecha).slice(0, 8)}2400`,
      suceso,
    })),
    ...historial.map((cambio) => ({
      es: "cambio" as const,
      orden: clave(cambio.cuando),
      cambio,
    })),
  ];
  // `sort` es estable: entre iguales queda el orden de cada lista (lo más nuevo primero).
  return entradas.sort((una, otra) => otra.orden.localeCompare(una.orden));
}

function Hito({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string | undefined;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative z-10 grid size-6 shrink-0 place-items-center rounded-full border border-borde bg-superficie text-texto-2",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** `ruta`: la del panel de la etapa actual, donde se abren las ventanas. */
export async function Actividad({
  servicioId,
  historial,
  ruta,
  puedeEscribir,
}: {
  readonly servicioId: string;
  readonly historial: readonly CambioDeEstado[];
  readonly ruta: string;
  readonly puedeEscribir: boolean;
}) {
  const sucesos = await armado().sucesos.listar(servicioId);
  const entradas = lineaDeTiempo(sucesos, historial);
  return (
    <section
      aria-labelledby="titulo-de-actividad"
      className="rounded-tarjeta border border-borde bg-superficie shadow-tarjeta"
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
        <h2
          id="titulo-de-actividad"
          className="m-0 flex items-baseline gap-2 text-[15px] font-semibold"
        >
          Actividad
          <span className="cifras text-xs font-normal text-texto-3">
            {entradas.length}
          </span>
        </h2>
        {puedeEscribir ? (
          <Enlace
            href={`${ruta}?suceso=1`}
            scroll={false}
            className={clasesDeBoton("secundario", "h-8 px-2.5 text-[13px]")}
            data-carga="suceso"
          >
            <Plus aria-hidden="true" />
            Observación
          </Enlace>
        ) : null}
      </header>
      {sucesos.length === 0 && puedeEscribir ? (
        <p className="mx-4 mb-2 rounded-control bg-superficie-2 px-3 py-2 text-[13px] text-texto-2">
          Todavía no hay observaciones. Anotá hallazgos, aclaraciones del
          cliente o lo que convenga recordar.
        </p>
      ) : null}
      <ol className="relative m-0 list-none px-4 pt-1 pb-3 before:absolute before:top-4 before:bottom-6 before:left-[27px] before:w-px before:bg-borde">
        {entradas.map((entrada) => {
          if (entrada.es === "cambio") {
            const { cambio } = entrada;
            const etapa = ETAPA_DE_ETIQUETA.get(cambio.a);
            return (
              <li
                key={`cambio-${cambio.posicion}`}
                data-cambio-de-estado
                className="relative flex gap-3 py-2"
              >
                <Hito>
                  {etapa === undefined ? null : (
                    <PuntoDeEtapa etapa={etapa} className="size-2.5" />
                  )}
                </Hito>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="m-0 text-[13px] text-texto-2">
                    <span className="font-medium text-texto">
                      {cambio.de === ""
                        ? "Creó el servicio"
                        : `Pasó a «${cambio.a}»`}
                    </span>
                    <span className="text-texto-3"> · {cambio.cuando}</span>
                  </p>
                  {cambio.nota === "" ? null : (
                    <p className="mt-1 mb-0 text-[13px] whitespace-pre-line break-words text-texto-2">
                      {cambio.nota}
                    </p>
                  )}
                  <p className="mt-1 mb-0 text-xs text-texto-3">
                    <Persona quien={cambio.quien} chica />
                  </p>
                </div>
              </li>
            );
          }
          const { suceso } = entrada;
          const Icono = ICONO_DE_TIPO[suceso.tipo] ?? MessageSquareText;
          return (
            <li
              key={suceso.id}
              data-suceso
              className="relative flex gap-3 py-2"
            >
              <Hito
                className={
                  suceso.tipo === "Hallazgo"
                    ? "border-aviso bg-aviso-suave text-aviso"
                    : undefined
                }
              >
                <Icono className="size-3.5" />
              </Hito>
              <div className="min-w-0 flex-1 rounded-control border border-borde bg-superficie-2/50 px-3 py-2">
                <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-texto-3">
                  <Persona
                    quien={suceso.autor}
                    chica
                    className="font-medium text-texto"
                  />
                  <span
                    data-tipo-de-suceso
                    className="rounded-full bg-superficie-3 px-1.5 text-[11px] font-medium text-texto-2"
                  >
                    {suceso.tipo}
                  </span>
                  <span className="cifras ml-auto">{suceso.fecha}</span>
                </p>
                <p className="mt-1.5 mb-0 text-[13px] whitespace-pre-line break-words">
                  {suceso.texto}
                </p>
                {puedeEscribir ? (
                  <Enlace
                    href={`${ruta}?anularSuceso=${suceso.id}`}
                    scroll={false}
                    className="mt-1 inline-block text-xs text-texto-3 no-underline hover:text-peligro hover:underline"
                    data-carga="suceso"
                  >
                    Anular
                  </Enlace>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
