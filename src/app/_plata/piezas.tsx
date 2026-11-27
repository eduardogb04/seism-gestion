/**
 * Piezas compartidas por las pantallas de Plata: filtros como enlaces, estado
 * vacío, tarjetas para celular y el pie de totales. Sin estado: todo en el
 * servidor.
 */

import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../_ui/cn.ts";
import { Enlace } from "../_ui/enlace-next.ts";
import { CLASES_DE_ENLACE_DE_FILA } from "../_ui/tabla.tsx";
import { Importe } from "../servicios/_listado/piezas.tsx";

export { Importe };

/** Un atajo o filtro que es un enlace; `activo` lo deja apretado. */
export function FiltroEnlace({
  href,
  activo,
  children,
}: {
  readonly href: string;
  readonly activo: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Enlace
      href={href}
      aria-pressed={activo}
      className="presionable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-borde bg-superficie px-3 text-[13px] font-medium text-texto-2 no-underline shadow-tarjeta hover:border-borde-fuerte hover:text-texto aria-pressed:border-acento/40 aria-pressed:bg-acento-suave aria-pressed:text-texto"
    >
      {children}
    </Enlace>
  );
}

/** La fila de filtros: en celular, una sola fila que se desliza de costado. */
export function FilaDeFiltros({ children }: { readonly children: ReactNode }) {
  return (
    <search className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
      {children}
    </search>
  );
}

export function Vacio({
  titulo,
  texto,
}: {
  readonly titulo: string;
  readonly texto?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-tarjeta border border-borde bg-superficie px-5 py-14 text-center shadow-tarjeta">
      <Inbox
        aria-hidden="true"
        className="size-8 text-texto-3"
        strokeWidth={1.5}
      />
      <p data-total-del-listado className="m-0 font-medium">
        {titulo}
      </p>
      {texto === undefined ? null : <p className="m-0 text-texto-2">{texto}</p>}
    </div>
  );
}

/** El título de un bloque de la pantalla, con cuántas filas tiene. */
export function TituloDeBloque({
  titulo,
  cantidad,
  tono = "normal",
}: {
  readonly titulo: string;
  readonly cantidad: number;
  readonly tono?: "normal" | "peligro";
}) {
  return (
    <h2
      className={cn(
        "m-0 flex items-center gap-2 text-[15px] font-semibold",
        tono === "peligro" && "text-peligro",
      )}
    >
      {titulo}
      <span className="cifras text-[13px] font-normal text-texto-3">
        {cantidad}
      </span>
    </h2>
  );
}

export function ChipVencida({ atraso }: { readonly atraso: string }) {
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-peligro-suave px-2 py-0.5 text-xs font-medium whitespace-nowrap text-peligro ring-1 ring-peligro/20 ring-inset">
      Vencida hace {atraso}
    </span>
  );
}

export function ListaDeTarjetas({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
      {children}
    </ul>
  );
}

/**
 * Una fila en celular: el enlace de `titulo` se estira a toda la tarjeta y lo
 * de `accion` queda por encima.
 */
export function TarjetaDeFila({
  href,
  titulo,
  derecha,
  children,
  accion,
  tono = "normal",
}: {
  readonly href: string | null;
  readonly titulo: ReactNode;
  readonly derecha?: ReactNode;
  readonly children?: ReactNode;
  readonly accion?: ReactNode;
  readonly tono?: "normal" | "peligro";
}) {
  return (
    <li
      className={cn(
        "relative flex flex-col gap-1 rounded-tarjeta border p-3 shadow-tarjeta",
        tono === "peligro"
          ? "border-peligro/25 bg-peligro-suave"
          : "border-borde bg-superficie",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {href === null ? (
          <span className="min-w-0 font-medium">{titulo}</span>
        ) : (
          <Enlace
            href={href}
            className={cn(CLASES_DE_ENLACE_DE_FILA, "min-w-0")}
          >
            {titulo}
          </Enlace>
        )}
        {derecha}
      </div>
      {children}
      {accion === undefined ? null : (
        <div className="relative z-10 mt-2 flex justify-end">{accion}</div>
      )}
    </li>
  );
}

export function Paginas({
  texto,
  anterior,
  siguiente,
}: {
  readonly texto: string;
  readonly anterior: string | null;
  readonly siguiente: string | null;
}) {
  const boton =
    "presionable grid size-9 place-items-center rounded-md border border-borde bg-superficie text-texto-2 no-underline shadow-tarjeta hover:border-borde-fuerte hover:text-texto";
  return (
    <nav
      aria-label="Páginas"
      className="flex items-center justify-between gap-3 text-[13px] text-texto-2"
    >
      <span data-total-del-listado className="cifras">
        {texto}
      </span>
      <span className="flex items-center gap-2">
        {anterior === null ? null : (
          <Enlace
            href={anterior}
            aria-label="Página anterior"
            className={boton}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Enlace>
        )}
        {siguiente === null ? null : (
          <Enlace
            href={siguiente}
            aria-label="Página siguiente"
            className={boton}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Enlace>
        )}
      </span>
    </nav>
  );
}

/** Los totales al pie de un listado, uno por renglón (cada uno con su `data-*` para las pruebas). */
export function Totales({
  renglones,
}: {
  readonly renglones: readonly {
    readonly etiqueta: string;
    readonly valor: string;
    readonly dato: string;
  }[];
}) {
  return (
    <dl className="m-0 ml-auto flex w-full max-w-xs flex-col gap-1 rounded-tarjeta border border-borde bg-superficie p-4 text-[13px] shadow-tarjeta">
      {renglones.map(({ etiqueta, valor, dato }) => (
        <div
          key={`${etiqueta}${valor}`}
          className="flex items-baseline justify-between gap-4"
        >
          <dt className="text-texto-2">{etiqueta}</dt>
          <dd {...{ [dato]: "" }} className="m-0">
            <Importe texto={valor} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
