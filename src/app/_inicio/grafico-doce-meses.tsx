"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Fila = {
  readonly mes: string;
  readonly facturado: number;
  readonly egresos: number;
};

const MESES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
const etiqueta = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
const numero = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
const completo = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);

export function GraficoDoceMeses({
  meses,
  moneda,
}: {
  readonly meses: readonly Fila[];
  readonly moneda: string;
}) {
  return (
    <div
      className="h-64 w-full"
      role="img"
      aria-label="Facturado contra egresos de los últimos doce meses"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={[...meses]}
          barGap={3}
          barCategoryGap="28%"
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
        >
          <CartesianGrid vertical={false} stroke="var(--color-borde)" />
          <XAxis
            dataKey="mes"
            tickFormatter={etiqueta}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--color-texto-3)", fontSize: 12 }}
          />
          <YAxis
            tickFormatter={numero}
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: "var(--color-texto-3)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "var(--color-superficie-2)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-borde bg-superficie px-3 py-2 text-xs shadow-flota">
                  <p className="mb-1 font-medium text-texto capitalize">
                    {etiqueta(String(label))} {String(label).slice(0, 4)}
                  </p>
                  {payload.map((p) => (
                    <p
                      key={String(p.dataKey)}
                      className="flex items-center gap-2 text-texto-2"
                    >
                      <span
                        className="size-2 rounded-sm"
                        style={{ background: String(p.color) }}
                      />
                      {p.dataKey === "facturado" ? "Facturado" : "Egresos"}
                      <span className="cifras ml-auto pl-4 text-texto">
                        {moneda} {completo(Number(p.value))}
                      </span>
                    </p>
                  ))}
                </div>
              ) : null
            }
          />
          <Bar
            dataKey="facturado"
            fill="var(--color-serie-1)"
            radius={[4, 4, 0, 0]}
            animationDuration={500}
          />
          <Bar
            dataKey="egresos"
            fill="var(--color-serie-2)"
            radius={[4, 4, 0, 0]}
            animationDuration={500}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
