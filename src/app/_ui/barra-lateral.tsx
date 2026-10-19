"use client";

/**
 * La barra lateral (F3-05). En la pantalla ancha se contrae a solo íconos con
 * un formulario que guarda la cookie `menu` (el navegador lo recuerda); en el
 * celular es un menú que se abre con su botón y se cierra con Escape o al
 * navegar. Las entradas las dibuja el servidor (`marco.tsx`) y llegan como
 * `children`; contraídas, su texto queda solo para el lector de pantalla.
 */

import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { usePathname } from "next/navigation.js";
import { type ReactNode, useId, useRef, useState } from "react";
import { contraerMenu } from "./acciones-de-preferencias.ts";
import { usePreferencias } from "./preferencias-en-pantalla.tsx";

const BOTON =
  "size-11 cursor-pointer items-center justify-center rounded text-menu-texto hover:bg-menu-activo focus-visible:outline-menu-texto";

export function BarraLateral({ children }: { readonly children: ReactNode }) {
  const { menuContraido } = usePreferencias();
  const ruta = usePathname();
  // Abierto mientras se está en la ruta donde se abrió: al navegar, se cierra solo.
  const [abiertoEn, setAbiertoEn] = useState<string | null | undefined>();
  const abierto = abiertoEn !== undefined && abiertoEn === ruta;
  const idLista = useId();
  // El repo no carga los tipos del DOM (`lib: ES2023`): del botón solo hace falta `focus()`.
  const botonMenu = useRef<{ focus(): void }>(null);

  return (
    <nav
      aria-label="Secciones"
      data-contraida={menuContraido ? "si" : "no"}
      onKeyDown={(evento) => {
        if (abierto && evento.key === "Escape") {
          setAbiertoEn(undefined);
          botonMenu.current?.focus();
        }
      }}
      className="group/menu bg-menu text-menu-texto md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:overflow-y-auto md:data-[contraida=si]:w-16"
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-3 md:group-data-[contraida=si]/menu:justify-center">
        <span className="text-lg font-semibold md:group-data-[contraida=si]/menu:sr-only">
          SeisM
        </span>
        <button
          ref={botonMenu}
          type="button"
          aria-label="Menú"
          aria-expanded={abierto}
          aria-controls={idLista}
          onClick={() => setAbiertoEn(abierto ? undefined : ruta)}
          className={`${BOTON} inline-flex md:hidden`}
        >
          {abierto ? (
            <X aria-hidden="true" className="size-5" />
          ) : (
            <Menu aria-hidden="true" className="size-5" />
          )}
        </button>
        <form action={contraerMenu} className="hidden md:block">
          <button
            type="submit"
            name="menu"
            value={menuContraido ? "expandido" : "contraido"}
            aria-label="Menú lateral"
            aria-expanded={!menuContraido}
            aria-controls={idLista}
            title={menuContraido ? "Mostrar los nombres" : "Solo íconos"}
            className={`${BOTON} inline-flex`}
          >
            {menuContraido ? (
              <PanelLeftOpen aria-hidden="true" className="size-5" />
            ) : (
              <PanelLeftClose aria-hidden="true" className="size-5" />
            )}
          </button>
        </form>
      </div>
      <div
        id={idLista}
        className={`${abierto ? "block" : "hidden"} px-2 pb-3 md:block`}
      >
        {children}
      </div>
    </nav>
  );
}
