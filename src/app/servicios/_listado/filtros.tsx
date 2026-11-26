"use client";

/**
 * Buscador y filtros del listado: un formulario GET de toda la vida (anda sin
 * JavaScript con «Enter»); con JavaScript, cada lista filtra al elegir.
 */

import { ChevronDown, Search, X } from "lucide-react";
import { useRouter } from "next/navigation.js";
import type { FormEvent, ReactNode } from "react";
import type { Opcion } from "../../../server/servicios.ts";
import { cn } from "../../_ui/cn.ts";
import { Enlace } from "../../_ui/enlace-next.ts";

type Lista = {
  readonly nombre: string;
  readonly etiqueta: string;
  readonly todos: string;
  readonly opciones: readonly Opcion[];
  readonly elegido: string;
};

function Selector({ nombre, etiqueta, todos, opciones, elegido }: Lista) {
  return (
    <label className="relative inline-flex shrink-0 items-center">
      <span className="sr-only">{etiqueta}</span>
      <select
        name={nombre}
        defaultValue={elegido}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cn(
          "h-9 max-w-48 appearance-none truncate rounded-md border bg-superficie py-0 pr-8 pl-3 text-[13px] font-medium shadow-tarjeta transition-colors duration-150 hover:border-borde-fuerte sm:max-w-52",
          elegido === ""
            ? "border-borde text-texto-2"
            : "border-acento/40 bg-acento-suave text-texto",
        )}
      >
        <option value="">{todos}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 size-4 text-texto-3"
      />
    </label>
  );
}

export function Filtros({
  vista,
  buscar,
  listas,
  ocultos,
  limpiar,
  children,
}: {
  readonly vista: "tablero" | "tabla";
  readonly buscar: string;
  readonly listas: readonly Lista[];
  /** Lo que el formulario conserva sin mostrar (el orden de la tabla). */
  readonly ocultos: Readonly<Record<string, string>>;
  /** El enlace sin filtros; `null` si no hay ninguno puesto. */
  readonly limpiar: string | null;
  /** Atajos que van en la misma fila que las listas («Míos»). */
  readonly children?: ReactNode;
}) {
  const router = useRouter();
  // Con JavaScript navega sin recargar y sin dejar en la dirección los filtros vacíos.
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const consulta = new URLSearchParams(
      [...new FormData(evento.currentTarget)].flatMap(([clave, valor]) =>
        typeof valor === "string" && valor.trim() !== ""
          ? [[clave, valor.trim()]]
          : [],
      ),
    ).toString();
    router.push(consulta === "" ? "/servicios" : `/servicios?${consulta}`);
  }
  return (
    <search>
      <form
        onSubmit={enviar}
        action="/servicios"
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
      >
        {vista === "tabla" ? (
          <input type="hidden" name="vista" value="tabla" />
        ) : null}
        {Object.entries(ocultos).map(([nombre, valor]) => (
          <input key={nombre} type="hidden" name={nombre} value={valor} />
        ))}
        <label className="relative flex items-center sm:w-64">
          <span className="sr-only">Buscar servicios</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 size-4 text-texto-3"
          />
          <input
            type="search"
            name="buscar"
            defaultValue={buscar}
            placeholder="Código, título o cliente"
            className="h-9 w-full rounded-md border border-borde bg-superficie pr-3 pl-8 text-[13px] shadow-tarjeta transition-colors duration-150 placeholder:text-texto-3 hover:border-borde-fuerte"
          />
        </label>
        {/* En celular, una sola fila que se desliza de costado. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {children}
          {listas.map((lista) => (
            <Selector key={lista.nombre} {...lista} />
          ))}
          {limpiar ? (
            <Enlace
              href={limpiar}
              className="presionable inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium text-texto-2 no-underline hover:bg-superficie-2 hover:text-texto"
            >
              <X aria-hidden="true" className="size-3.5" />
              Limpiar
            </Enlace>
          ) : null}
        </div>
        <button type="submit" className="sr-only">
          Buscar
        </button>
      </form>
    </search>
  );
}
