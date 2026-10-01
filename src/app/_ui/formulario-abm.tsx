"use client";

/**
 * El formulario de alta, de edición y de confirmación de baja (sin campos) de
 * cualquier ABM (F1-03, ADR 0031). Es el
 * único componente de cliente de `_ui/`: `useActionState` es lo que permite
 * que una acción rechazada vuelva con lo que la persona escribió y el mensaje
 * al lado de cada campo. Con JavaScript apagado funciona igual: el formulario
 * se envía entero y la página vuelve renderizada con ese mismo estado.
 */

import { useActionState } from "react";
import type { ErroresPorCampo } from "../../casos-uso/abm/abm.ts";
import type { CampoAbm, Escrito } from "../../casos-uso/abm/definicion.ts";
import type { ErrorDeLogin } from "../../casos-uso/sesion/errores.ts";
import { Boton, clasesDeBoton, type VarianteDeBoton } from "./boton.tsx";
import { CampoTexto, CampoTextoLargo } from "./campo-texto.tsx";
import { ErrorEnPantalla } from "./error-en-pantalla.tsx";

export type EstadoFormulario = {
  readonly escrito: Escrito;
  readonly errores: ErroresPorCampo;
  /** Lo que no se arregla corrigiendo un campo: va arriba, con su código. */
  readonly error?: ErrorDeLogin;
};

function Control({
  nombre,
  campo,
  estado,
}: {
  readonly nombre: string;
  readonly campo: CampoAbm;
  readonly estado: EstadoFormulario;
}) {
  const comunes = {
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
  }
}

export function FormularioAbm({
  accion,
  campos,
  inicial,
  enviar: { texto, variante },
  rutaAlCancelar,
}: {
  readonly accion: (
    previo: EstadoFormulario,
    formulario: FormData,
  ) => Promise<EstadoFormulario>;
  readonly campos: readonly (readonly [string, CampoAbm])[];
  readonly inicial: EstadoFormulario;
  readonly enviar: {
    readonly texto: string;
    readonly variante: VarianteDeBoton;
  };
  readonly rutaAlCancelar: string;
}) {
  const [estado, alEnviar, enviando] = useActionState(accion, inicial);
  return (
    <form action={alEnviar} className="flex max-w-xl flex-col gap-4">
      {estado.error === undefined ? null : (
        <ErrorEnPantalla error={estado.error} />
      )}
      {campos.map(([nombre, campo]) => (
        <Control key={nombre} nombre={nombre} campo={campo} estado={estado} />
      ))}
      <div className="flex flex-wrap gap-3">
        <Boton variante={variante} type="submit" disabled={enviando}>
          {texto}
        </Boton>
        <a href={rutaAlCancelar} className={clasesDeBoton("secundario")}>
          Cancelar
        </a>
      </div>
    </form>
  );
}
