"use client";

import {
  Bell,
  CalendarClock,
  FileText,
  type LucideIcon,
  Play,
  Receipt,
  Wallet,
} from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";
import { diasHasta } from "../_inicio/formato.ts";
import { cn } from "./cn.ts";
import { Enlace as Link } from "./enlace-next.ts";
import { EtapaDeRenovacion } from "./etapa-de-renovacion.tsx";

export type EntradaDeAviso = {
  readonly tipo:
    | "vencimiento"
    | "factura"
    | "egreso"
    | "inicio"
    | "cotizacion"
    | "ajuste"
    | "cuota";
  readonly fecha: string;
  readonly titulo: string;
  readonly importe: string | null;
  readonly vencida: boolean;
  readonly enlace: string;
  readonly responsableId?: string | null | undefined;
  readonly etapaDeRenovacion?: 60 | 45 | 30 | null | undefined;
};

export type AvisosDeLaBarra = {
  readonly dias: number;
  readonly vencidos: number;
  readonly proximos: number;
  readonly entradas: readonly EntradaDeAviso[];
};

const ICONO: Record<EntradaDeAviso["tipo"], LucideIcon> = {
  vencimiento: CalendarClock,
  factura: Receipt,
  egreso: Wallet,
  inicio: Play,
  cotizacion: FileText,
  ajuste: FileText,
  cuota: Receipt,
};

/** Lo vencido primero (lo más viejo arriba), después lo próximo por fecha. */
export function ordenarPorUrgencia(
  entradas: readonly EntradaDeAviso[],
): EntradaDeAviso[] {
  return [...entradas].sort(
    (a, b) =>
      Number(b.vencida) - Number(a.vencida) || a.fecha.localeCompare(b.fecha),
  );
}

/** «Venció hace 5 días», «Vence hoy», «Vence en 3 días». */
export function textoDeVencimiento(dias: number): string {
  if (dias === 0) return "Vence hoy";
  const n = Math.abs(dias);
  const unidad = n === 1 ? "día" : "días";
  return dias < 0 ? `Venció hace ${n} ${unidad}` : `Vence en ${n} ${unidad}`;
}

export function CampanaDeAvisos({
  avisos,
  usuarioId,
  esAdministrador,
}: {
  readonly avisos: AvisosDeLaBarra;
  readonly usuarioId: string;
  readonly esAdministrador: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [soloMios, setSoloMios] = useState(false);
  const visibles =
    esAdministrador && soloMios
      ? avisos.entradas.filter((e) => e.responsableId === usuarioId)
      : avisos.entradas;
  const total = avisos.vencidos + avisos.proximos;
  const entradas = ordenarPorUrgencia(visibles);
  return (
    <Popover.Root open={abierto} onOpenChange={setAbierto}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title="Avisos"
          aria-label={`Avisos: ${total} ${total === 1 ? "pendiente" : "pendientes"}`}
          className="presionable relative inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-borde bg-superficie text-texto-2 shadow-tarjeta hover:border-borde-fuerte hover:text-texto"
        >
          <Bell aria-hidden="true" className="size-4" />
          {total > 0 ? (
            <span
              className={cn(
                "cifras absolute -top-1.5 -right-1.5 grid min-w-[18px] place-items-center rounded-full px-1 text-[11px] leading-[18px] font-semibold text-sobre-acento",
                avisos.vencidos > 0 ? "bg-peligro" : "bg-acento",
              )}
            >
              {total}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          side="bottom"
          sideOffset={8}
          collisionPadding={12}
          className="menu-flotante z-50 flex max-h-[70vh] w-[min(380px,calc(100vw-24px))] flex-col rounded-[10px] border border-borde bg-superficie shadow-flota"
        >
          <div className="flex items-center justify-between border-b border-borde px-4 py-3">
            <h2 className="m-0 text-sm font-semibold">Avisos</h2>
            {esAdministrador ? (
              <div className="flex gap-0.5 rounded-md border border-borde p-0.5 text-xs">
                {[
                  { texto: "Míos", valor: true },
                  { texto: "Todos", valor: false },
                ].map(({ texto, valor }) => (
                  <button
                    key={texto}
                    type="button"
                    aria-pressed={soloMios === valor}
                    onClick={() => setSoloMios(valor)}
                    className={cn(
                      "rounded px-2 py-0.5 font-medium",
                      soloMios === valor
                        ? "bg-superficie-2 text-texto"
                        : "text-texto-3 hover:text-texto",
                    )}
                  >
                    {texto}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {entradas.length === 0 ? (
              <p className="m-0 px-2.5 py-6 text-center text-[13px] text-texto-3">
                No hay nada por vencer en los próximos {avisos.dias} días.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-px p-0">
                {entradas.map((e) => {
                  const Icono = ICONO[e.tipo];
                  return (
                    <li key={`${e.tipo}-${e.enlace}-${e.fecha}-${e.titulo}`}>
                      <Link
                        href={e.enlace}
                        onClick={() => setAbierto(false)}
                        className="flex gap-2.5 rounded-md px-2.5 py-2 text-texto no-underline hover:bg-superficie-2"
                      >
                        <Icono
                          aria-hidden="true"
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            e.vencida ? "text-peligro" : "text-texto-3",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">
                            {e.titulo}
                          </span>
                          <span className="block text-xs text-texto-3">
                            <span
                              className={e.vencida ? "text-peligro" : undefined}
                            >
                              {textoDeVencimiento(diasHasta(e.fecha))}
                            </span>
                            {e.importe === null ? null : (
                              <>
                                {" · "}
                                <span className="cifras">{e.importe}</span>
                              </>
                            )}
                          </span>
                          <EtapaDeRenovacion etapa={e.etapaDeRenovacion} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-borde px-4 py-2.5 text-[13px]">
            <Link href="/calendario" onClick={() => setAbierto(false)}>
              Ver calendario
            </Link>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
