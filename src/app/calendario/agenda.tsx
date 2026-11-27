/** La vista Agenda: lo vencido arriba y después cada día con sus entradas. */

import type { EntradaDelCalendario } from "../../casos-uso/calendario/calendario.ts";
import { aFechaHora } from "../../casos-uso/compartido/movimientos.ts";
import { diferenciaEnDias } from "../../dominio/compartido/reloj.ts";
import { Importe, TituloDeBloque } from "../_plata/piezas.tsx";
import { cn } from "../_ui/cn.ts";
import { Enlace } from "../_ui/enlace-next.ts";
import {
  claveDeEntrada,
  type Estado,
  enlaceDelCalendario,
  PUNTO_DE_TIPO,
} from "./eventos.ts";

/** «Hoy», «Mañana» o «jueves 3 de diciembre». */
function nombreDelDia(fecha: string, hoy: string): string {
  const resta = diferenciaEnDias(aFechaHora(fecha), aFechaHora(hoy));
  if (resta === 0) return "Hoy";
  if (resta === 1) return "Mañana";
  return new Date(`${fecha}T12:00:00Z`)
    .toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    })
    .replace(",", "");
}

function atraso(dias: number): string {
  return dias === 1 ? "1 día" : `${dias} días`;
}

function Fila({
  entrada,
  estado,
  hoy,
  ancla,
}: {
  readonly entrada: EntradaDelCalendario;
  readonly estado: Estado;
  readonly hoy: string;
  readonly ancla: boolean;
}) {
  return (
    <li id={ancla ? `dia-${entrada.fecha}` : undefined} className="scroll-mt-4">
      <Enlace
        href={enlaceDelCalendario(estado, { evento: claveDeEntrada(entrada) })}
        scroll={false}
        className="flex min-h-14 items-center gap-3 px-4 py-2.5 text-texto no-underline hover:bg-superficie-2"
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            PUNTO_DE_TIPO[entrada.tipo],
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span
            className={cn(
              "max-w-full truncate font-medium",
              entrada.renovacion !== null && "text-texto-3",
            )}
          >
            {entrada.titulo}
          </span>
          {entrada.renovacion !== null ? (
            <span className="text-xs text-texto-3">
              Renovado · {entrada.renovacion.codigo}
            </span>
          ) : null}
          {entrada.vencida ? (
            <span className="inline-flex w-fit items-center rounded-full bg-peligro-suave px-2 py-0.5 text-xs font-medium whitespace-nowrap text-peligro ring-1 ring-peligro/20 ring-inset">
              Vencido hace{" "}
              {atraso(
                diferenciaEnDias(aFechaHora(hoy), aFechaHora(entrada.fecha)),
              )}
            </span>
          ) : null}
        </span>
        {entrada.importe === null ? null : (
          <Importe texto={entrada.importe} className="shrink-0" />
        )}
      </Enlace>
    </li>
  );
}

function Bloque({
  titulo,
  entradas,
  estado,
  hoy,
  vistas,
  tono,
}: {
  readonly titulo: string;
  readonly entradas: readonly EntradaDelCalendario[];
  readonly estado: Estado;
  readonly hoy: string;
  /** Los días que ya tienen su ancla, para no repetir un `id`. */
  readonly vistas: Set<string>;
  readonly tono?: "peligro";
}) {
  return (
    <section className="flex flex-col gap-2">
      <TituloDeBloque
        titulo={titulo}
        cantidad={entradas.length}
        tono={tono ?? "normal"}
      />
      <ul className="m-0 list-none divide-y divide-borde overflow-hidden rounded-tarjeta border border-borde bg-superficie p-0 shadow-tarjeta">
        {entradas.map((entrada) => {
          const primera = !vistas.has(entrada.fecha);
          vistas.add(entrada.fecha);
          return (
            <Fila
              key={claveDeEntrada(entrada)}
              entrada={entrada}
              estado={estado}
              hoy={hoy}
              ancla={primera}
            />
          );
        })}
      </ul>
    </section>
  );
}

export function Agenda({
  vencidas,
  proximas,
  estado,
  hoy,
}: {
  /** Todo lo vencido, de cualquier mes. */
  readonly vencidas: readonly EntradaDelCalendario[];
  /** Las del mes que no están vencidas. */
  readonly proximas: readonly EntradaDelCalendario[];
  readonly estado: Estado;
  readonly hoy: string;
}) {
  const dias = [...new Set(proximas.map(({ fecha }) => fecha))];
  const vistas = new Set<string>();
  return (
    <div className="flex flex-col gap-6">
      {vencidas.length === 0 ? null : (
        <Bloque
          titulo="Vencido"
          tono="peligro"
          entradas={vencidas}
          estado={estado}
          hoy={hoy}
          vistas={vistas}
        />
      )}
      {dias.map((fecha) => (
        <Bloque
          key={fecha}
          titulo={nombreDelDia(fecha, hoy)}
          entradas={proximas.filter((e) => e.fecha === fecha)}
          estado={estado}
          hoy={hoy}
          vistas={vistas}
        />
      ))}
    </div>
  );
}
