"use client";

/**
 * Un hito como fila de checklist: casilla + nombre y, si está hecho, fecha y
 * autor debajo. Subir y quitar son íconos que aparecen al pasar el mouse (en
 * el celular, siempre). Tildar pide confirmación; destildar, confirmación y
 * motivo; quitar, confirmación.
 */

import { ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { EstadoFormulario } from "../../_ui/formulario-abm.tsx";
import { Confirmar } from "../[id]/_molde/confirmar.tsx";
import { FilaEditable } from "../[id]/_molde/fila-editable.tsx";

const ICONO =
  "grid size-7 cursor-pointer place-items-center rounded-control text-texto-3 hover:bg-superficie-2 hover:text-texto pointer-coarse:size-11";

export function FilaDeHito({
  texto,
  realizado,
  puedeTildar,
  tildar,
  destildar,
  subir,
  quitar,
  editar,
}: {
  readonly texto: string;
  /** `25/10/2026 · Admin`, o `null` si no está hecho. */
  readonly realizado: string | null;
  /** `null`: no se puede editar (hecho, o la etapa no arma). */
  readonly editar:
    | ((
        previo: EstadoFormulario,
        formulario: FormData,
      ) => Promise<EstadoFormulario>)
    | null;
  readonly puedeTildar: boolean;
  readonly tildar: (formulario: FormData) => Promise<void>;
  readonly destildar: (formulario: FormData) => Promise<void>;
  /** `null`: el primero, o no se arma la lista. */
  readonly subir: (() => Promise<void>) | null;
  /** `null`: no se puede quitar (hecho, o la etapa no arma). */
  readonly quitar: (() => Promise<void>) | null;
}) {
  const hecho = realizado !== null;
  const [editando, setEditando] = useState(false);
  if (editando && editar !== null) {
    return (
      <li data-hito={texto} className="border-b border-borde last:border-b-0">
        <FilaEditable
          campos={[
            { nombre: "texto", etiqueta: "Hito", requerido: true, crece: true },
          ]}
          inicial={{ texto }}
          accion={editar}
          alCancelar={() => setEditando(false)}
        />
      </li>
    );
  }
  return (
    <li
      data-hito={texto}
      className="group flex items-start gap-2.5 border-b border-borde py-2 last:border-b-0"
    >
      <Confirmar
        titulo={
          hecho
            ? `¿Destildar el hito "${texto}"?`
            : `¿Marcar "${texto}" como hecho?`
        }
        {...(hecho
          ? { texto: "Queda registrado como observación del servicio." }
          : {})}
        textoDeAccion={hecho ? "Destildar" : "Confirmar"}
        accion={hecho ? destildar : tildar}
        conMotivo={hecho}
        motivoObligatorio={hecho}
        peligro={hecho}
      >
        {(abrir) => (
          <input
            type="checkbox"
            checked={hecho}
            disabled={!puedeTildar}
            onChange={abrir}
            aria-label={hecho ? `Destildar "${texto}"` : `Tildar "${texto}"`}
            className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-acento disabled:cursor-default pointer-coarse:size-6"
          />
        )}
      </Confirmar>
      <div className="min-w-0 flex-1">
        <div
          className={`text-sm ${hecho ? "text-texto-2 line-through decoration-texto-3/60" : "text-texto"}`}
        >
          {texto}
        </div>
        {hecho ? (
          <div data-hito-realizado className="text-xs text-texto-3">
            {realizado}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
        {subir === null ? null : (
          <form action={subir}>
            <button
              type="submit"
              aria-label={`Subir "${texto}"`}
              title="Subir"
              className={ICONO}
            >
              <ArrowUp aria-hidden="true" className="size-4" />
            </button>
          </form>
        )}
        {editar === null ? null : (
          <button
            type="button"
            onClick={() => setEditando(true)}
            aria-label={`Editar "${texto}"`}
            title="Editar"
            className={ICONO}
          >
            <Pencil aria-hidden="true" className="size-4" />
          </button>
        )}
        {quitar === null ? null : (
          <Confirmar
            titulo={`¿Quitar el hito "${texto}"?`}
            textoDeAccion="Quitar"
            accion={quitar}
          >
            {(abrir) => (
              <button
                type="button"
                onClick={abrir}
                aria-label={`Quitar "${texto}"`}
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
