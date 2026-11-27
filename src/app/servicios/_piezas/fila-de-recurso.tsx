"use client";

/** Un recurso como fila de lista: lo principal arriba, el resto chico debajo y el tacho (con confirmación) a la derecha. */

import { Trash2 } from "lucide-react";
import { Confirmar } from "../[id]/_molde/confirmar.tsx";

export function FilaDeRecurso({
  titulo,
  detalle,
  quitar,
}: {
  readonly titulo: string;
  readonly detalle: string;
  /** `null`: la etapa no deja quitar. */
  readonly quitar: (() => Promise<void>) | null;
}) {
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
      {quitar === null ? null : (
        <div className="flex shrink-0 items-center md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
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
                className="grid size-7 cursor-pointer place-items-center rounded-control text-texto-3 hover:bg-superficie-2 hover:text-peligro pointer-coarse:size-11"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            )}
          </Confirmar>
        </div>
      )}
    </li>
  );
}
