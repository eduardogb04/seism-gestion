"use client";

/**
 * Confirmar: el cartel chico, centrado, que pide el sí antes de una acción que
 * borra o deshace (quitar, destildar, anular).
 *
 *   <Confirmar
 *     titulo={`¿Quitar el hito "${texto}"?`}
 *     textoDeAccion="Quitar"
 *     accion={quitarHito.bind(null, servicioId, id)}   // acción de servidor, recibe el FormData
 *     conMotivo                                          // campo `motivo`; `motivoObligatorio` lo exige
 *   >
 *     {(abrir) => <button type="button" onClick={abrir}>…</button>}
 *   </Confirmar>
 *
 * Se abre con `abrir` y se cierra con Cancelar o Escape. Un `<dialog>` nativo:
 * el foco contenido y Escape los da el navegador.
 */

import { type ReactNode, useId, useRef, useState } from "react";
import { Boton } from "../../../_ui/boton.tsx";

export function Confirmar({
  titulo,
  texto,
  textoDeAccion,
  accion,
  conMotivo = false,
  motivoObligatorio = false,
  peligro = true,
  children,
}: {
  readonly titulo: string;
  readonly texto?: string;
  readonly textoDeAccion: string;
  readonly accion: (formulario: FormData) => void | Promise<void>;
  readonly conMotivo?: boolean;
  readonly motivoObligatorio?: boolean;
  /** false para confirmar algo que no deshace (tildar): el botón va en el acento. */
  readonly peligro?: boolean;
  readonly children: (abrir: () => void) => ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [enviando, setEnviando] = useState(false);
  const id = useId();
  return (
    <>
      {children(() => dialogo.current?.showModal())}
      <dialog
        ref={dialogo}
        aria-labelledby={`${id}-t`}
        className="m-auto w-[min(92vw,26rem)] rounded-tarjeta border border-borde bg-superficie p-5 text-texto shadow-tarjeta backdrop:bg-texto/40"
      >
        <form
          action={async (formulario) => {
            setEnviando(true);
            try {
              await accion(formulario);
            } finally {
              setEnviando(false);
              dialogo.current?.close();
            }
          }}
          className="grid gap-3"
        >
          <h3
            id={`${id}-t`}
            className="m-0 text-base font-semibold text-balance"
          >
            {titulo}
          </h3>
          {texto === undefined ? null : (
            <p className="m-0 text-[13px] text-texto-2">{texto}</p>
          )}
          {conMotivo ? (
            <label className="grid gap-1 text-[13px] text-texto-2">
              {motivoObligatorio ? "Motivo" : "Motivo (opcional)"}
              <textarea
                name="motivo"
                rows={2}
                required={motivoObligatorio}
                className="rounded-control border border-borde-control bg-superficie p-2 text-sm text-texto"
              />
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <Boton
              variante="fantasma"
              type="button"
              onClick={() => dialogo.current?.close()}
            >
              Cancelar
            </Boton>
            <Boton
              variante={peligro ? "peligro" : "primario"}
              type="submit"
              cargando={enviando}
            >
              {textoDeAccion}
            </Boton>
          </div>
        </form>
      </dialog>
    </>
  );
}
