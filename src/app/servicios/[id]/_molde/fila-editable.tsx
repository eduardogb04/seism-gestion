"use client";

/**
 * FilaEditable: la fila que se completa en el lugar de una lista (agregar un
 * hito o un recurso). Los campos van en una línea que envuelve; Enter confirma
 * (✓), Escape cancela (✕). El guardado es la acción de servidor que ya existía
 * (`cargarHito`, `cargarRecurso`): si la rechaza, el error sale debajo y la
 * fila sigue abierta; si sale bien, la acción redirige y la lista se vuelve a
 * dibujar.
 *
 *   <FilaEditable campos={[{ nombre: "texto", etiqueta: "Hito" }]}
 *                 accion={cargarHito.bind(null, servicioId)} alCancelar={…} />
 *   <AgregarEnLinea texto="Agregar hito" campos={…} accion={…} />
 */

import { Check, Plus, X } from "lucide-react";
import { type ReactNode, useActionState, useState } from "react";
import type { EstadoFormulario } from "../../../_ui/formulario-abm.tsx";

export type CampoEnLinea = {
  readonly nombre: string;
  readonly etiqueta: string;
  readonly tipo?: "texto" | "fecha" | "opcion";
  readonly opciones?: readonly { valor: string; texto: string }[];
  /** Se muestra solo cuando otro campo vale esto (el camión, si el tipo es camión). */
  readonly soloSi?: { readonly campo: string; readonly valor: string };
  /** Ancho mínimo en rem del control. */
  readonly ancho?: number;
  readonly requerido?: boolean;
  /** Ocupa el ancho que sobra de la línea. */
  readonly crece?: boolean;
};

type Accion = (
  previo: EstadoFormulario,
  formulario: FormData,
) => Promise<EstadoFormulario>;

const CONTROL =
  "h-8 rounded-control border border-borde-control bg-superficie px-2 text-sm text-texto pointer-coarse:h-11";

export function FilaEditable({
  campos,
  inicial = {},
  accion,
  alCancelar,
}: {
  readonly campos: readonly CampoEnLinea[];
  readonly inicial?: Readonly<Record<string, string>>;
  readonly accion: Accion;
  readonly alCancelar: () => void;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {
    escrito: {},
    errores: {},
  });
  const [valores, setValores] = useState<Record<string, string>>({
    ...Object.fromEntries(campos.map(({ nombre }) => [nombre, ""])),
    ...inicial,
  });
  const errores = Object.values(estado.errores).flat().filter(Boolean);
  return (
    <form
      action={enviar}
      onKeyDown={(evento) => {
        if (evento.key === "Escape") {
          evento.preventDefault();
          alCancelar();
        }
      }}
      className="grid gap-1 py-1.5"
      data-fila-editable
    >
      <div className="flex flex-wrap items-end gap-2">
        {campos
          .filter(
            ({ soloSi }) =>
              soloSi === undefined || valores[soloSi.campo] === soloSi.valor,
          )
          .map((campo, lugar) => {
            const propios = {
              name: campo.nombre,
              value: valores[campo.nombre] ?? "",
              onChange: (evento: { target: { value: string } }) =>
                setValores({ ...valores, [campo.nombre]: evento.target.value }),
              required: campo.requerido ?? false,
              className: CONTROL,
              style: { minWidth: `${campo.ancho ?? 8}rem` },
            };
            let control: ReactNode;
            if (campo.tipo === "opcion") {
              control = (
                // biome-ignore lint/a11y/noAutofocus: la fila nace para escribir en ella
                <select {...propios} autoFocus={lugar === 0}>
                  {campo.requerido ? null : <option value="">—</option>}
                  {campo.opciones?.map(({ valor, texto }) => (
                    <option key={valor} value={valor}>
                      {texto}
                    </option>
                  ))}
                </select>
              );
            } else {
              control = (
                <input
                  {...propios}
                  type={campo.tipo === "fecha" ? "date" : "text"}
                  // biome-ignore lint/a11y/noAutofocus: la fila nace para escribir en ella
                  autoFocus={lugar === 0}
                  autoComplete="off"
                />
              );
            }
            return (
              // biome-ignore lint/a11y/noLabelWithoutControl: el control va adentro, armado arriba
              <label
                key={campo.nombre}
                className={`grid gap-0.5 text-xs text-texto-3 ${campo.crece ? "flex-[1_1_14rem]" : ""}`}
              >
                {campo.etiqueta}
                {control}
              </label>
            );
          })}
        <span className="flex items-center gap-0.5 pb-0.5">
          <button
            type="submit"
            disabled={pendiente}
            aria-label="Confirmar"
            title="Confirmar (Enter)"
            className="grid size-8 cursor-pointer place-items-center rounded-control text-acento hover:bg-acento-suave pointer-coarse:size-11"
          >
            <Check aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            onClick={alCancelar}
            aria-label="Cancelar"
            title="Cancelar (Escape)"
            className="grid size-8 cursor-pointer place-items-center rounded-control text-texto-2 hover:bg-superficie-2 pointer-coarse:size-11"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </span>
      </div>
      {estado.error !== undefined || errores.length > 0 ? (
        <p role="alert" className="m-0 text-xs text-peligro">
          {errores.length > 0 ? errores.join(" ") : "No se pudo guardar."}
        </p>
      ) : null}
    </form>
  );
}

/** «+ Agregar …» al final de una lista: al tocarlo aparece la fila editable. */
export function AgregarEnLinea({
  texto,
  campos,
  inicial,
  accion,
}: {
  readonly texto: string;
  readonly campos: readonly CampoEnLinea[];
  readonly inicial?: Readonly<Record<string, string>>;
  readonly accion: Accion;
}) {
  const [abierta, setAbierta] = useState(false);
  return abierta ? (
    <FilaEditable
      campos={campos}
      {...(inicial === undefined ? {} : { inicial })}
      accion={accion}
      alCancelar={() => setAbierta(false)}
    />
  ) : (
    <button
      type="button"
      onClick={() => setAbierta(true)}
      className="presionable mt-1 inline-flex cursor-pointer items-center gap-1 rounded-control px-1.5 py-1 text-[13px] font-medium text-acento hover:bg-superficie-2 pointer-coarse:min-h-11"
    >
      <Plus aria-hidden="true" className="size-3.5" />
      {texto}
    </button>
  );
}
