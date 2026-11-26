"use client";

/**
 * Una ventana sobre la pantalla (F1-09, auditoría A2/M8): un `<dialog>` nativo
 * abierto con `showModal()`, presentado como panel lateral derecho de 480 px
 * (en el celular, hoja de abajo a pantalla completa). El navegador da la
 * página de atrás inerte, el foco contenido, Escape y el gesto de volver; el
 * estilo y la animación están en `globales.css` (`.ventana`).
 *
 * La URL sigue siendo la fuente de verdad: el servidor la dibuja según el
 * parámetro (`?nuevo=1`, `?editar=…`) y, cuando la persona la cierra (Escape,
 * el botón, o tocando afuera con `closedby="any"`), se navega a `rutaAlCerrar`.
 */

import { X } from "lucide-react";
import { useRouter } from "next/navigation.js";
import { type ReactNode, useEffect, useId, useRef } from "react";

/** Lo que toma el foco al abrir: lo marcado, si no el primer campo, si no lo que elija el navegador. */
const MARCADO = "[data-autofocus]";
const PRIMER_CAMPO =
  "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])";

/** Tocar afuera donde el navegador todavía no entiende `closedby` (Safari). */
function cierreTocandoAfuera(dialogo: HTMLDialogElement): () => void {
  if ("closedBy" in HTMLDialogElement.prototype) {
    return () => {};
  }
  const afuera = (evento: PointerEvent) => {
    const caja = dialogo.getBoundingClientRect();
    return (
      evento.clientX < caja.left ||
      evento.clientX > caja.right ||
      evento.clientY < caja.top ||
      evento.clientY > caja.bottom
    );
  };
  let empezoAfuera = false;
  const alApretar = (evento: PointerEvent) => {
    empezoAfuera = afuera(evento);
  };
  const alSoltar = (evento: PointerEvent) => {
    if (empezoAfuera && afuera(evento)) {
      dialogo.close();
    }
  };
  dialogo.addEventListener("pointerdown", alApretar);
  dialogo.addEventListener("pointerup", alSoltar);
  return () => {
    dialogo.removeEventListener("pointerdown", alApretar);
    dialogo.removeEventListener("pointerup", alSoltar);
  };
}

export function Ventana({
  titulo,
  rutaAlCerrar,
  children,
}: {
  readonly titulo: string;
  readonly rutaAlCerrar: string;
  readonly children: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const cuerpo = useRef<HTMLDivElement>(null);
  const ruta = useRef(rutaAlCerrar);
  const router = useRouter();
  const idDelTitulo = useId();

  useEffect(() => {
    ruta.current = rutaAlCerrar;
  }, [rutaAlCerrar]);

  useEffect(() => {
    const elemento = dialogo.current;
    if (elemento === null) {
      return;
    }
    if (!elemento.open) {
      elemento.showModal();
      const dentro = cuerpo.current;
      const objetivo =
        dentro?.querySelector<HTMLElement>(MARCADO) ??
        dentro?.querySelector<HTMLElement>(PRIMER_CAMPO);
      objetivo?.focus();
    }
    // Se cerró desde el navegador (Escape, afuera) o con el botón: la URL manda.
    const alCerrar = () => {
      router.push(ruta.current, { scroll: false });
    };
    elemento.addEventListener("close", alCerrar);
    const soltarAfuera = cierreTocandoAfuera(elemento);
    return () => {
      elemento.removeEventListener("close", alCerrar);
      soltarAfuera();
    };
  }, [router]);

  return (
    <dialog
      ref={dialogo}
      aria-labelledby={idDelTitulo}
      className="ventana"
      {...{ closedby: "any" }}
    >
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-borde bg-superficie/90 px-5 backdrop-blur-sm">
        <h1
          id={idDelTitulo}
          className="m-0 truncate text-base font-semibold tracking-tight"
        >
          {titulo}
        </h1>
        <button
          type="button"
          aria-label="Cerrar"
          title="Cerrar (Esc)"
          onClick={() => dialogo.current?.close()}
          className="presionable -mr-1.5 grid size-8 shrink-0 cursor-pointer place-items-center rounded-control text-texto-2 hover:bg-superficie-2 hover:text-texto pointer-coarse:size-11"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>
      <div ref={cuerpo} className="px-5 pt-5 pb-6">
        {children}
      </div>
    </dialog>
  );
}
