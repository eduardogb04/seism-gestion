import { type LucideIcon, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

export const PORCENTAJE = new Intl.NumberFormat("es-AR", {
  style: "percent",
  signDisplay: "exceptZero",
  maximumFractionDigits: 1,
});

/** Sube, baja o igual: el signo y el ícono lo dicen, además del color. */
function Variacion({ variacion }: { readonly variacion: number }) {
  const [Icono, color] =
    variacion > 0
      ? [TrendingUp, "bg-exito-suave text-exito"]
      : variacion < 0
        ? [TrendingDown, "bg-peligro-suave text-peligro"]
        : [Minus, "bg-superficie-2 text-texto-suave"];
  return (
    <p
      data-variacion
      className={`cifras mt-2 inline-flex w-fit items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${color}`}
    >
      <Icono aria-hidden="true" className="size-3" />
      {PORCENTAJE.format(variacion)}
    </p>
  );
}

/** El tamaño del valor: el de la cifra principal del inicio, el común, o el de las tarjetas de cada moneda (F3-08). */
const TAMANOS = {
  grande: "text-[32px] leading-9",
  comun: "text-[26px] leading-8",
  chica: "text-lg leading-7",
} as const;

/**
 * Un indicador del inicio (F3-05): título, valor ya formateado (puede ser un
 * enlace al listado que lo explica) y, si hay, qué incluye (texto o un número
 * con su enlace), un ícono y la variación (una fracción: `0.125` es +12,5 %).
 */
export function TarjetaKpi({
  titulo,
  valor,
  detalle,
  Icono,
  variacion,
  tamano = "comun",
}: {
  readonly titulo: string;
  readonly valor: ReactNode;
  readonly detalle?: ReactNode;
  readonly tamano?: keyof typeof TAMANOS;
  readonly Icono?: LucideIcon;
  readonly variacion?: number;
}) {
  return (
    <article className="flex min-w-0 flex-col rounded-tarjeta border border-borde bg-superficie p-5 shadow-tarjeta">
      <h3 className="m-0 flex items-center gap-2 text-[13px] font-medium text-texto-2">
        {Icono === undefined ? null : (
          <Icono aria-hidden="true" className="size-4 shrink-0" />
        )}
        {titulo}
      </h3>
      <p
        className={`cifras mt-2 mb-0 ${TAMANOS[tamano]} font-semibold tracking-tight text-texto [&_a]:text-texto [&_a]:no-underline [&_a:hover]:underline`}
      >
        {valor}
      </p>
      {detalle === undefined ? null : (
        <p className="mt-1 mb-0 text-[13px] text-texto-3">{detalle}</p>
      )}
      {variacion === undefined ? null : <Variacion variacion={variacion} />}
    </article>
  );
}
