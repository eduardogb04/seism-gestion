/**
 * Piezas chicas del listado de servicios, sin estado: sirven en el servidor
 * (la tabla) y en el cliente (el tablero).
 */

import {
  CalendarClock,
  FileText,
  HandCoins,
  type LucideIcon,
  PlayCircle,
  Wallet,
} from "lucide-react";
import type {
  AvisoDeServicio,
  Persona as DatosDePersona,
  ServicioDelListado,
} from "../../../server/servicios.ts";
import { distancia, fechaCorta } from "../../_inicio/formato.ts";
import { cn } from "../../_ui/cn.ts";
import { Enlace } from "../../_ui/enlace-next.ts";

export function Iniciales({
  persona,
  className,
}: {
  readonly persona: DatosDePersona;
  readonly className?: string;
}) {
  return (
    <span
      title={persona.nombre}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full border border-borde bg-superficie-2 text-[10px] font-semibold tracking-wide text-texto-2",
        className,
      )}
    >
      <span aria-hidden="true">{persona.iniciales}</span>
      <span className="sr-only">Responsable: {persona.nombre}</span>
    </span>
  );
}

export function Persona({ persona }: { readonly persona: DatosDePersona }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="grid size-6 shrink-0 place-items-center rounded-full border border-borde bg-superficie-2 text-[10px] font-semibold tracking-wide text-texto-2"
      >
        {persona.iniciales}
      </span>
      <span className="truncate">{persona.nombre}</span>
    </span>
  );
}

/** `ARS 1.250.000,00` con la moneda apagada y el número tabular. */
export function Importe({
  texto,
  className,
}: {
  readonly texto: string;
  readonly className?: string;
}) {
  const [moneda = "", ...resto] = texto.split(" ");
  return (
    <span
      className={cn(
        "cifras inline-flex items-baseline gap-1 whitespace-nowrap",
        className,
      )}
    >
      <span className="text-[11px] font-medium text-texto-3">{moneda}</span>
      <span className="font-medium text-texto">{resto.join(" ")}</span>
    </span>
  );
}

export function diasEnLaEtapa(dias: number): string {
  if (dias === 0) return "hoy";
  return dias === 1 ? "1 día" : `${dias} días`;
}

const ICONO: Record<AvisoDeServicio["tipo"], LucideIcon> = {
  factura: HandCoins,
  vencimiento: CalendarClock,
  inicio: PlayCircle,
  egreso: Wallet,
  cotizacion: FileText,
  cuota: HandCoins,
};

/** Rojo si ya venció; ámbar si vence dentro del plazo de aviso; un inicio por venir, neutro. */
export function tonoDe(aviso: AvisoDeServicio): string {
  if (aviso.vencida) return "text-peligro";
  return aviso.tipo === "inicio" ? "text-texto-2" : "text-aviso";
}

/** Fecha + distancia, con el color que corresponde. */
export function Vencimiento({
  aviso,
  conQue = false,
}: {
  readonly aviso: AvisoDeServicio;
  readonly conQue?: boolean;
}) {
  const Icono = ICONO[aviso.tipo];
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-[13px]",
        tonoDe(aviso),
      )}
    >
      <Icono aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">
        {conQue ? <span className="font-medium">{aviso.que} · </span> : null}
        <span className="cifras">{fechaCorta(aviso.fecha)}</span>
        <span className="text-texto-3"> · </span>
        {distancia(aviso.fecha)}
      </span>
    </span>
  );
}

/** El aviso de la tarjeta, corto: «Factura vencida hace 3 días», «Vence en 12 días». */
export function fraseDeAviso(aviso: AvisoDeServicio): string {
  const cuando = distancia(aviso.fecha);
  switch (aviso.tipo) {
    case "inicio":
      return aviso.vencida ? `Debía empezar ${cuando}` : `Empieza ${cuando}`;
    case "factura":
      return aviso.vencida
        ? `Factura vencida ${cuando}`
        : `Factura vence ${cuando}`;
    default:
      return aviso.vencida ? `Venció ${cuando}` : `Vence ${cuando}`;
  }
}

/** Para el tablero: código, título, cliente, importe, días en la etapa, responsable y el aviso. */
export function TarjetaDeServicio({
  servicio,
  arrastrable = false,
  className,
}: {
  readonly servicio: ServicioDelListado;
  readonly arrastrable?: boolean;
  readonly className?: string;
}) {
  const { aviso } = servicio;
  const Icono = aviso ? ICONO[aviso.tipo] : null;
  return (
    <Enlace
      href={servicio.enlace}
      draggable={false}
      data-servicio={servicio.id}
      data-etapa={servicio.etapa}
      className={cn(
        "group/tarjeta relative block select-none rounded-tarjeta border border-borde bg-superficie p-3 text-texto no-underline shadow-tarjeta transition-[border-color,box-shadow] duration-150 hover:border-borde-fuerte hover:shadow-flota focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento",
        arrastrable && "md:cursor-grab",
        className,
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-[12px] tracking-tight text-texto-3">
          {servicio.codigo}
        </span>
        <Iniciales persona={servicio.responsable} />
      </span>
      <span className="mt-1 line-clamp-2 text-[14px] font-medium leading-5 text-texto">
        {servicio.titulo}
      </span>
      <span className="mt-0.5 block truncate text-[13px] text-texto-2">
        {servicio.cliente.nombre}
      </span>
      <span className="mt-3 flex items-center justify-between gap-2">
        {servicio.importe ? (
          <Importe texto={servicio.importe.texto} className="text-[13px]" />
        ) : (
          <span className="text-[13px] text-texto-3">Sin cotizar</span>
        )}
        <span
          className="cifras shrink-0 text-[12px] text-texto-3"
          title="Días en la etapa"
        >
          {diasEnLaEtapa(servicio.dias)}
        </span>
      </span>
      {aviso && Icono ? (
        <span
          className={cn(
            "mt-3 -mx-3 -mb-3 flex items-center gap-1.5 rounded-b-tarjeta border-t px-3 py-2 text-[12px] font-medium",
            aviso.vencida
              ? "border-peligro/20 bg-peligro-suave text-peligro"
              : aviso.tipo === "inicio"
                ? "border-borde bg-superficie-2 text-texto-2"
                : "border-aviso/20 bg-aviso-suave text-aviso",
          )}
        >
          <Icono aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate" title={aviso.que}>
            {fraseDeAviso(aviso)}
          </span>
        </span>
      ) : null}
    </Enlace>
  );
}
