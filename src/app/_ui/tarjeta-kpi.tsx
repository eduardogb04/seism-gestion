import { type LucideIcon, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

const PORCENTAJE = new Intl.NumberFormat("es-AR", {
  style: "percent",
  signDisplay: "exceptZero",
  maximumFractionDigits: 1,
});

/** Sube, baja o igual: el signo y el ícono lo dicen, además del color. */
function Variacion({ variacion }: { readonly variacion: number }) {
  const [Icono, color] =
    variacion > 0
      ? [TrendingUp, "text-exito"]
      : variacion < 0
        ? [TrendingDown, "text-peligro"]
        : [Minus, "text-texto-suave"];
  return (
    <p
      data-variacion
      className={`mt-1 inline-flex items-center gap-1 text-sm font-medium ${color}`}
    >
      <Icono aria-hidden="true" className="size-4" />
      {PORCENTAJE.format(variacion)}
    </p>
  );
}

/**
 * Un indicador del inicio (F3-05): título, valor ya formateado (puede ser un
 * enlace al listado que lo explica) y, si hay, qué incluye, un ícono y la
 * variación (una fracción: `0.125` es +12,5 %).
 */
export function TarjetaKpi({
  titulo,
  valor,
  detalle,
  Icono,
  variacion,
}: {
  readonly titulo: string;
  readonly valor: ReactNode;
  readonly detalle?: string;
  readonly Icono?: LucideIcon;
  readonly variacion?: number;
}) {
  return (
    <article className="flex flex-col rounded border border-borde bg-superficie p-4 shadow-sm dark:shadow-none">
      <h3 className="flex items-center gap-2 text-sm font-medium text-texto-suave">
        {Icono === undefined ? null : (
          <Icono aria-hidden="true" className="size-4 shrink-0" />
        )}
        {titulo}
      </h3>
      <p className="mt-2 text-2xl font-semibold tabular-nums [&_a]:no-underline [&_a:hover]:underline">
        {valor}
      </p>
      {detalle === undefined ? null : (
        <p className="mt-1 text-sm text-texto-suave">{detalle}</p>
      )}
      {variacion === undefined ? null : <Variacion variacion={variacion} />}
    </article>
  );
}
