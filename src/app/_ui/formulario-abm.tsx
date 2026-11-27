"use client";

/**
 * El formulario de alta, de edición y de confirmación de baja (sin campos) de
 * cualquier ABM (F1-03, ADR 0031), dentro de la ventana (F1-09). Es el único
 * componente de cliente: `useActionState` es lo que permite que una acción
 * rechazada vuelva con lo que la persona escribió y el mensaje al lado de cada
 * campo.
 *
 * Los obligatorios llevan `required` (el navegador frena el envío y enfoca el
 * primero vacío) y los opcionales dicen «opcional» (FRONT_SPEC 4.3). Si el
 * servidor rechaza, el foco va al primer campo inválido (o al error general).
 * Mientras envía, el botón dice «Guardando…»; si el guardado sale bien (la
 * acción redirige y el formulario se desmonta), un toast lo confirma.
 */

import { useRouter } from "next/navigation.js";
import {
  createContext,
  type ReactNode,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import type {
  ErroresPorCampo,
  OpcionDeRelacion,
  OpcionesPorCampo,
} from "../../casos-uso/abm/abm.ts";
import { nombreDeFuente } from "../../casos-uso/abm/cambio.ts";
import {
  type CampoAbm,
  type Escrito,
  MARCADA,
  MONEDAS,
  nombreDeMoneda,
  seOfreceElCambio,
} from "../../casos-uso/abm/definicion.ts";
import type { ErrorDeLogin } from "../../casos-uso/sesion/errores.ts";
import { Boton, clasesDeBoton, type VarianteDeBoton } from "./boton.tsx";
import { CampoLista, controlDe } from "./campo-lista.tsx";
import { CampoRecursos } from "./campo-recursos.tsx";
import {
  CampoArchivo,
  CampoCambio,
  CampoImporte,
  CampoTexto,
  CampoTextoLargo,
  CasillaSiNo,
} from "./campo-texto.tsx";
import { Enlace } from "./enlace-next.ts";
import { ErrorEnPantalla } from "./error-en-pantalla.tsx";
import { Selector } from "./selector.tsx";

const EscritoEnVivo = createContext<Escrito>({});
const ErroresEnVivo = createContext<ErroresPorCampo>({});

/** Los errores por campo con que volvió el formulario: para un control propio que va dentro de él. */
export function useErroresDelFormulario(): ErroresPorCampo {
  return useContext(ErroresEnVivo);
}

/**
 * Lo escrito en el formulario que contiene a quien la llama, al día con cada
 * tecla (F2-06): lo que se calcula con los campos y se muestra al lado.
 */
export function useEscritoEnVivo(): Escrito {
  return useContext(EscritoEnVivo);
}

export type EstadoFormulario = {
  readonly escrito: Escrito;
  readonly errores: ErroresPorCampo;
  /** Lo que no se arregla corrigiendo un campo: va arriba, con su código. */
  readonly error?: ErrorDeLogin;
  /**
   * Salió bien y la acción no navegó: la pantalla se refrescó en el lugar. El
   * formulario avisa y, si está en una ventana, la cierra (fix 13).
   */
  readonly hecho?: true;
};

/** Si el campo se puede dejar vacío (`false`: obligatorio; `null`: no se marca). */
function esOpcional(campo: CampoAbm): boolean | null {
  switch (campo.tipo) {
    case "texto":
    case "numero":
    case "fecha":
    case "opcion":
      return campo.opcional === true;
    case "relacion":
      return campo.obligatoria !== true;
    case "textoLargo":
    case "servicio":
      return true;
    case "importe":
    case "tipoDeCambio":
      return false;
    case "siNo":
    case "lista":
    case "archivo":
      return null;
  }
}

function Control({
  nombre,
  campo,
  elegibles,
  estado,
  alAbrir,
}: {
  readonly nombre: string;
  readonly campo: CampoAbm;
  /** Los registros que se pueden elegir en una relación. */
  readonly elegibles: readonly OpcionDeRelacion[];
  readonly estado: EstadoFormulario;
  readonly alAbrir: boolean;
}) {
  // Un `<select>` no toma de nuevo su `defaultValue` cuando React resetea el
  // formulario después de la acción: la `key` lo vuelve a armar con lo escrito.
  const opcional = esOpcional(campo);
  const comunes = {
    autoFocus: alAbrir,
    etiqueta: campo.etiqueta,
    name: nombre,
    defaultValue: estado.escrito[nombre] ?? "",
    error: estado.errores[nombre],
    opcional: opcional === true,
    required: opcional === false,
  };
  switch (campo.tipo) {
    case "texto":
      return <CampoTexto type="text" {...comunes} />;
    case "textoLargo":
      return <CampoTextoLargo {...comunes} />;
    case "fecha":
      return <CampoTexto type="date" {...comunes} />;
    case "importe":
      return (
        <CampoImporte
          {...comunes}
          nombreMoneda={nombreDeMoneda(nombre)}
          monedas={MONEDAS}
          monedaInicial={estado.escrito[nombreDeMoneda(nombre)] ?? MONEDAS[0]}
        />
      );
    case "tipoDeCambio":
      return (
        <CampoCambio
          {...comunes}
          nombreFuente={nombreDeFuente(nombre)}
          fuenteInicial={estado.escrito[nombreDeFuente(nombre)] ?? ""}
        />
      );
    case "numero":
      return (
        <CampoTexto
          type="text"
          inputMode={campo.decimales === 0 ? "numeric" : "decimal"}
          {...comunes}
        />
      );
    case "opcion":
      return (
        <Selector
          key={comunes.defaultValue}
          {...comunes}
          opciones={[
            {
              valor: "",
              texto: campo.opcional === true ? "Ninguna" : "Elegí una opción",
            },
            ...campo.opciones.map(({ valor, etiqueta }) => ({
              valor,
              texto: etiqueta,
            })),
          ]}
        />
      );
    case "relacion":
    case "servicio":
      return (
        <Selector
          key={comunes.defaultValue}
          {...comunes}
          opciones={[
            {
              valor: "",
              texto:
                campo.tipo === "relacion" && campo.obligatoria === true
                  ? "Elegí…"
                  : "Ninguno",
            },
            ...elegibles,
          ]}
        />
      );
    case "siNo":
      return (
        <CasillaSiNo
          autoFocus={comunes.autoFocus}
          etiqueta={comunes.etiqueta}
          name={nombre}
          value={MARCADA}
          defaultChecked={estado.escrito[nombre] === MARCADA}
          error={comunes.error}
        />
      );
    case "lista":
      return campo.editor === "recursos" ? (
        <CampoRecursos
          etiqueta={comunes.etiqueta}
          name={nombre}
          defaultValue={comunes.defaultValue}
          error={comunes.error}
        />
      ) : (
        <CampoLista
          etiqueta={comunes.etiqueta}
          elemento={campo.elemento}
          name={nombre}
          defaultValue={comunes.defaultValue}
          error={comunes.error}
        />
      );
    case "archivo":
      return null;
  }
}

/** El mensaje del navegador para un obligatorio vacío, en castellano. */
const FALTA = "Completá este campo.";

function controlValidable(
  objetivo: EventTarget,
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null {
  return objetivo instanceof HTMLInputElement ||
    objetivo instanceof HTMLSelectElement ||
    objetivo instanceof HTMLTextAreaElement
    ? objetivo
    : null;
}

export function FormularioAbm({
  accion,
  campos,
  elegibles,
  inicial,
  archivo,
  children,
  despuesDe,
  enviar: { texto, variante },
  rutaAlCancelar,
}: {
  readonly accion: (
    previo: EstadoFormulario,
    formulario: FormData,
  ) => Promise<EstadoFormulario>;
  readonly campos: readonly (readonly [string, CampoAbm])[];
  /** Por campo de relación, lo que se puede elegir. */
  readonly elegibles: OpcionesPorCampo;
  readonly inicial: EstadoFormulario;
  /** Un campo de archivo al final (F2-05): su error vuelve en `errores[nombre]`. */
  readonly archivo?:
    | {
        readonly nombre: string;
        readonly etiqueta: string;
        readonly accept: string;
      }
    | undefined;
  /** Algo más después de los campos (F2-06): una vista de lo que se calcula con ellos. */
  readonly children?: ReactNode;
  /** Algo más justo debajo de un campo, por su nombre: lo que se calcula con él o un control propio. */
  readonly despuesDe?: Readonly<Record<string, ReactNode>> | undefined;
  readonly enviar: {
    readonly texto: string;
    readonly variante: VarianteDeBoton;
  };
  readonly rutaAlCancelar: string;
}) {
  const [estado, alEnviar, enviando] = useActionState(accion, inicial);
  const router = useRouter();
  const formulario = useRef<HTMLFormElement>(null);
  const enviandoAhora = useRef(false);
  const primero = useRef(inicial);

  // Rechazado por el servidor: el foco al primer campo inválido o al error general.
  useEffect(() => {
    if (estado === primero.current) {
      return;
    }
    if (estado.hecho === true) {
      toast.success(
        variante === "peligro" ? "Listo." : "Listo, quedó guardado.",
      );
      formulario.current?.closest("dialog")?.close();
      return;
    }
    const raiz = formulario.current;
    const objetivo =
      raiz?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      raiz?.querySelector<HTMLElement>('[role="alert"]');
    objetivo?.focus();
  }, [estado, variante]);

  useEffect(() => {
    enviandoAhora.current = enviando;
  }, [enviando]);

  // Se desmonta mientras enviaba: la acción redirigió, salió bien.
  useEffect(
    () => () => {
      if (enviandoAhora.current) {
        toast.success(
          variante === "peligro" ? "Listo." : "Listo, quedó guardado.",
        );
      }
    },
    [variante],
  );

  const [tecleado, tecleo] = useState<Escrito>({});
  const vivo = { ...estado.escrito, ...tecleado };
  return (
    <form
      ref={formulario}
      action={alEnviar}
      onInvalidCapture={(evento) => {
        const control = controlValidable(evento.target);
        if (control?.validity.valueMissing === true) {
          control.setCustomValidity(FALTA);
        }
      }}
      onInput={(evento) => {
        controlValidable(evento.target)?.setCustomValidity("");
        const control = controlDe(evento.target);
        if (control !== null) {
          tecleo((previo) => ({ ...previo, [control[0]]: control[1] }));
        }
      }}
      onKeyDown={(evento) => {
        // Dentro de una ventana, Escape lo resuelve el <dialog>.
        if (
          evento.key === "Escape" &&
          evento.currentTarget.closest("dialog") === null
        ) {
          router.push(rutaAlCancelar, { scroll: false });
        }
      }}
      className="flex flex-col gap-5"
    >
      {estado.error === undefined ? null : (
        <ErrorEnPantalla error={estado.error} />
      )}
      <EscritoEnVivo value={vivo}>
        <ErroresEnVivo value={estado.errores}>
          <div className="flex flex-col gap-4">
            {campos
              .filter(
                ([, campo]) =>
                  campo.tipo !== "archivo" &&
                  (campo.tipo !== "tipoDeCambio" ||
                    seOfreceElCambio(campo, vivo)),
              )
              .map(([nombre, campo], posicion) => (
                <div key={nombre}>
                  <Control
                    nombre={nombre}
                    campo={campo}
                    elegibles={elegibles[nombre] ?? []}
                    estado={estado}
                    alAbrir={posicion === 0}
                  />
                  {despuesDe?.[nombre]}
                </div>
              ))}
            {archivo === undefined ? null : (
              <div>
                <CampoArchivo
                  etiqueta={archivo.etiqueta}
                  name={archivo.nombre}
                  accept={archivo.accept}
                  error={estado.errores[archivo.nombre]}
                />
              </div>
            )}
          </div>
          {children}
        </ErroresEnVivo>
      </EscritoEnVivo>
      <div className="flex flex-wrap items-center gap-2 border-t border-borde pt-4 in-[.ventana]:sticky in-[.ventana]:bottom-0 in-[.ventana]:-mx-5 in-[.ventana]:-mb-6 in-[.ventana]:bg-superficie/95 in-[.ventana]:px-5 in-[.ventana]:pb-5 in-[.ventana]:backdrop-blur-sm">
        <Boton variante={variante} type="submit" cargando={enviando}>
          {enviando ? "Guardando…" : texto}
        </Boton>
        {/* La baja no tiene campos: el foco entra por *Cancelar*, la salida segura. */}
        <Enlace
          href={rutaAlCancelar}
          scroll={false}
          data-autofocus={campos.length === 0 ? true : undefined}
          className={clasesDeBoton("fantasma")}
        >
          Cancelar
        </Enlace>
      </div>
    </form>
  );
}
