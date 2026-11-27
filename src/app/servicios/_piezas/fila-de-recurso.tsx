"use client";

/**
 * Un recurso como fila de lista: lo principal arriba, el resto chico debajo y,
 * a la derecha, editar (la fila vuelve a ser editable en el lugar, con ✓/✕) y
 * quitar (con confirmación).
 */

import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { EstadoFormulario } from "../../_ui/formulario-abm.tsx";
import { Confirmar } from "../[id]/_molde/confirmar.tsx";
import {
  type CampoEnLinea,
  FilaEditable,
} from "../[id]/_molde/fila-editable.tsx";

const ICONO =
  "grid size-7 cursor-pointer place-items-center rounded-control text-texto-3 hover:bg-superficie-2 pointer-coarse:size-11";

export function FilaDeRecurso({
  titulo,
  detalle,
  quitar,
  campos,
  inicial,
  editar,
}: {
  readonly titulo: string;
  readonly detalle: string;
  /** `null`: la etapa no deja quitar. */
  readonly quitar: (() => Promise<void>) | null;
  readonly campos: readonly CampoEnLinea[];
  /** Lo guardado, para arrancar la edición. */
  readonly inicial: Readonly<Record<string, string>>;
  /** `null`: la etapa no deja editar. */
  readonly editar:
    | ((
        previo: EstadoFormulario,
        formulario: FormData,
      ) => Promise<EstadoFormulario>)
    | null;
}) {
  const [editando, setEditando] = useState(false);
  if (editando && editar !== null) {
    return (
      <li
        data-recurso={titulo}
        className="border-b border-borde last:border-b-0"
      >
        <FilaEditable
          campos={campos}
          inicial={inicial}
          accion={editar}
          alCancelar={() => setEditando(false)}
        />
      </li>
    );
  }
  return (
    <li
      data-recurso={titulo}
      className="group flex items-start gap-2.5 border-b border-borde py-2 last:border-b-0"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm text-texto">{titulo}</div>
        {detalle === "" ? null : (
          <div className="cifras text-xs text-texto-3">{detalle}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
        {editar === null ? null : (
          <button
            type="button"
            onClick={() => setEditando(true)}
            aria-label={`Editar "${titulo}"`}
            title="Editar"
            className={`${ICONO} hover:text-texto`}
          >
            <Pencil aria-hidden="true" className="size-4" />
          </button>
        )}
        {quitar === null ? null : (
          <Confirmar
            titulo={`¿Quitar el recurso "${titulo}"?`}
            textoDeAccion="Quitar"
            accion={quitar}
          >
            {(abrir) => (
              <button
                type="button"
                onClick={abrir}
                aria-label={`Quitar "${titulo}"`}
                title="Quitar"
                className={`${ICONO} hover:text-peligro`}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            )}
          </Confirmar>
        )}
      </div>
    </li>
  );
}
