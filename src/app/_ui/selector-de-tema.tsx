"use client";

import { type LucideIcon, Monitor, Moon, Sun } from "lucide-react";
import { elegirTema } from "./acciones-de-preferencias.ts";
import type { Tema } from "./preferencias.ts";
import { usePreferencias } from "./preferencias-en-pantalla.tsx";

const OPCIONES: readonly {
  readonly tema: Tema;
  readonly texto: string;
  readonly Icono: LucideIcon;
}[] = [
  { tema: "claro", texto: "Claro", Icono: Sun },
  { tema: "oscuro", texto: "Oscuro", Icono: Moon },
  { tema: "sistema", texto: "Como el sistema", Icono: Monitor },
];

/** Los tres temas, en la cabecera: el elegido queda apretado (`aria-pressed`). */
export function SelectorDeTema() {
  const { tema } = usePreferencias();
  return (
    <form action={elegirTema}>
      <fieldset className="inline-flex rounded border border-borde-control p-0.5">
        <legend className="sr-only">Tema</legend>
        {OPCIONES.map(({ tema: valor, texto, Icono }) => (
          <button
            key={valor}
            type="submit"
            name="tema"
            value={valor}
            title={texto}
            aria-pressed={tema === valor}
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded text-texto-suave motion-safe:transition-colors motion-safe:duration-150 hover:text-texto aria-pressed:bg-superficie-alta aria-pressed:text-texto pointer-coarse:size-11"
          >
            <Icono aria-hidden="true" className="size-4" />
            <span className="sr-only">{texto}</span>
          </button>
        ))}
      </fieldset>
    </form>
  );
}
