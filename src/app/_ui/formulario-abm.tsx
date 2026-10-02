"use client";

/**
 * El formulario de alta, de edición y de confirmación de baja (sin campos) de
 * cualquier ABM (F1-03, ADR 0031), dentro de la ventana (F1-09). Es el único
 * componente de cliente de `_ui/`: `useActionState` es lo que permite que una
 * acción rechazada vuelva con lo que la persona escribió y el mensaje al lado
 * de cada campo, y Escape cierra la ventana. Con JavaScript apagado funciona
 * igual: el formulario se envía entero y la página vuelve renderizada con ese
 * mismo estado.
 */

import { useRouter } from "next/navigation.js";
import { useActionState } from "react";
import type {
  ErroresPorCampo,
  OpcionDeRelacion,
  OpcionesPorCampo,
} from "../../casos-uso/abm/abm.ts";
import {
  type CampoAbm,
  type Escrito,
  MARCADA,
  MONEDAS,
  nombreDeMoneda,
} from "../../casos-uso/abm/definicion.ts";
import type { ErrorDeLogin } from "../../casos-uso/sesion/errores.ts";
import { Boton, clasesDeBoton, type VarianteDeBoton } from "./boton.tsx";
import {
  CampoArchivo,
  CampoImporte,
  CampoTexto,
  CampoTextoLargo,
  CasillaSiNo,
} from "./campo-texto.tsx";
import { Enlace } from "./enlace-next.ts";
import { ErrorEnPantalla } from "./error-en-pantalla.tsx";
import { Selector } from "./selector.tsx";

export type EstadoFormulario = {
  readonly escrito: Escrito;
  readonly errores: ErroresPorCampo;
  /** Lo que no se arregla corrigiendo un campo: va arriba, con su código. */
  readonly error?: ErrorDeLogin;
};

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
  const comunes = {
    autoFocus: alAbrir,
    etiqueta: campo.etiqueta,
    name: nombre,
    defaultValue: estado.escrito[nombre] ?? "",
    error: estado.errores[nombre],
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
            { valor: "", texto: "Elegí una opción" },
            ...campo.opciones.map(({ valor, etiqueta }) => ({
              valor,
              texto: etiqueta,
            })),
          ]}
        />
      );
    case "relacion":
      return (
        <Selector
          key={comunes.defaultValue}
          {...comunes}
          opciones={[
            {
              valor: "",
              texto: campo.obligatoria === true ? "Elegí…" : "Ninguno",
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
  }
}

/** La baja no tiene campos: el foco entra por *Cancelar*, la salida segura. */
function enfocar(enlace: { focus(): void } | null) {
  enlace?.focus();
}

export function FormularioAbm({
  accion,
  campos,
  elegibles,
  inicial,
  archivo,
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
  readonly archivo?: {
    readonly nombre: string;
    readonly etiqueta: string;
    readonly accept: string;
  };
  readonly enviar: {
    readonly texto: string;
    readonly variante: VarianteDeBoton;
  };
  readonly rutaAlCancelar: string;
}) {
  const [estado, alEnviar, enviando] = useActionState(accion, inicial);
  const router = useRouter();
  return (
    <form
      action={alEnviar}
      onKeyDown={(evento) => {
        if (evento.key === "Escape") {
          router.push(rutaAlCancelar, { scroll: false });
        }
      }}
      className="flex flex-col gap-4"
    >
      {estado.error === undefined ? null : (
        <ErrorEnPantalla error={estado.error} />
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {campos.map(([nombre, campo], posicion) => (
          <div
            key={nombre}
            className={campo.tipo === "textoLargo" ? "md:col-span-2" : ""}
          >
            <Control
              nombre={nombre}
              campo={campo}
              elegibles={elegibles[nombre] ?? []}
              estado={estado}
              alAbrir={posicion === 0}
            />
          </div>
        ))}
        {archivo === undefined ? null : (
          <div className="md:col-span-2">
            <CampoArchivo
              etiqueta={archivo.etiqueta}
              name={archivo.nombre}
              accept={archivo.accept}
              error={estado.errores[archivo.nombre]}
            />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Boton variante={variante} type="submit" disabled={enviando}>
          {texto}
        </Boton>
        <Enlace
          href={rutaAlCancelar}
          scroll={false}
          ref={campos.length === 0 ? enfocar : undefined}
          className={clasesDeBoton("secundario")}
        >
          Cancelar
        </Enlace>
      </div>
    </form>
  );
}
