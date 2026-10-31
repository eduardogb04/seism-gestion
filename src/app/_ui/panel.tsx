/**
 * Las piezas de un panel de etapa (F6-01, ADR 0048): qué toca hacer, los
 * números de la etapa, lo que falta y las acciones, siempre en ese orden y con
 * una sola acción principal.
 */

import { CircleCheck, CircleDashed, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { clasesDeBoton } from "./boton.tsx";
import { Enlace } from "./enlace-next.ts";
import { TarjetaKpi } from "./tarjeta-kpi.tsx";

/** El título dice qué toca hacer; la línea de abajo, en qué va la etapa. */
export function CabeceraDePanel({
  titulo,
  contexto,
  Icono,
}: {
  readonly titulo: string;
  readonly contexto: string;
  readonly Icono: LucideIcon;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-lg bg-superficie-alta text-texto-suave"
      >
        <Icono className="size-6" />
      </span>
      <div>
        <h2 className="text-xl font-semibold">{titulo}</h2>
        <p data-contexto-del-panel className="mt-0.5 text-texto-suave">
          {contexto}
        </p>
      </div>
    </div>
  );
}

/** Un subtítulo de panel, discreto, para separar sus partes. */
export function TituloDeParte({ children }: { readonly children: ReactNode }) {
  return (
    <h3 className="mt-6 mb-2 text-sm font-semibold tracking-wide text-texto-suave uppercase">
      {children}
    </h3>
  );
}

export function GrillaDeMetricas({
  metricas,
}: {
  readonly metricas: readonly ComponentProps<typeof TarjetaKpi>[];
}) {
  return (
    <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
      {metricas.map((metrica) => (
        <TarjetaKpi key={metrica.titulo} {...metrica} />
      ))}
    </div>
  );
}

/** Lo que hace falta antes de avanzar: hecho o pendiente (con ícono y texto, no solo color). */
export function ListaDeControl({
  titulo,
  items,
}: {
  readonly titulo: string;
  readonly items: readonly {
    readonly texto: string;
    readonly hecho: boolean;
    readonly detalle: string;
  }[];
}) {
  return (
    <>
      <TituloDeParte>{titulo}</TituloDeParte>
      <ul aria-label={titulo}>
        {items.map(({ texto, hecho, detalle }) => {
          const Icono = hecho ? CircleCheck : CircleDashed;
          return (
            <li
              key={texto}
              data-control={hecho ? "hecho" : "pendiente"}
              className="flex items-center gap-3 border-t border-borde py-2.5 first:border-t-0"
            >
              <Icono
                aria-hidden="true"
                className={`size-5 shrink-0 ${hecho ? "text-exito" : "text-texto-suave"}`}
              />
              <span className="sr-only">{hecho ? "Hecho:" : "Pendiente:"}</span>
              {texto}
              <span className="ml-auto text-sm text-texto-suave">
                {detalle}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export type Accion = {
  readonly texto: string;
  readonly href: string;
  readonly Icono?: LucideIcon;
  /** La carga del servicio que escribe este botón (`estados.ts`): la marca `data-carga`. */
  readonly carga?: string;
};

function EnlaceDeAccion({
  accion: { texto, href, Icono, carga },
  variante,
}: {
  readonly accion: Accion;
  readonly variante: "primario" | "secundario" | "discreto";
}) {
  return (
    <Enlace
      href={href}
      scroll={false}
      className={clasesDeBoton(variante)}
      data-carga={carga}
    >
      {Icono === undefined ? null : (
        <Icono aria-hidden="true" className="size-4" />
      )}
      {texto}
    </Enlace>
  );
}

/**
 * Una acción principal (si la etapa tiene una en este momento), las demás
 * secundarias y, aparte y a la derecha, las salidas del recorrido (cada una
 * abre su confirmación).
 */
export function BarraDeAcciones({
  principal,
  secundarias,
  salidas,
  rotuloDeSalidas,
}: {
  readonly principal: Accion | null;
  readonly secundarias: readonly Accion[];
  readonly salidas: readonly Accion[];
  readonly rotuloDeSalidas?: string;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-borde pt-4">
      {principal === null ? null : (
        <EnlaceDeAccion accion={principal} variante="primario" />
      )}
      {secundarias.map((accion) => (
        <EnlaceDeAccion
          key={accion.texto}
          accion={accion}
          variante="secundario"
        />
      ))}
      {salidas.length === 0 ? null : (
        <section
          aria-label="Cambiar de etapa"
          className="flex flex-wrap items-center gap-1 text-sm text-texto-suave sm:ml-auto"
        >
          {rotuloDeSalidas === undefined ? null : (
            <span className="mr-1">{rotuloDeSalidas}</span>
          )}
          {salidas.map((accion) => (
            <EnlaceDeAccion
              key={accion.texto}
              accion={accion}
              variante="discreto"
            />
          ))}
        </section>
      )}
    </div>
  );
}
