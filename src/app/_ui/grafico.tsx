/**
 * Un gráfico de barras o de líneas (F3-05, para el inicio de F3-08). Es SVG
 * dibujado en el servidor con visx: sin JavaScript de cliente, y los colores
 * son clases del tema (`fill-serie-1`, `stroke-borde`...), así cambia con él.
 * Para el lector de pantalla, el SVG es una imagen con nombre y los números
 * van en una tabla oculta.
 */

import { AxisBottom, AxisLeft } from "@visx/axis";
import { Group } from "@visx/group";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar, LinePath } from "@visx/shape";

export type Serie = {
  readonly nombre: string;
  readonly puntos: readonly {
    readonly etiqueta: string;
    readonly valor: number;
  }[];
};

/** Literales enteros: Tailwind solo genera las clases que ve escritas. */
const COLORES = [
  { relleno: "fill-serie-1", trazo: "stroke-serie-1", muestra: "bg-serie-1" },
  { relleno: "fill-serie-2", trazo: "stroke-serie-2", muestra: "bg-serie-2" },
  { relleno: "fill-serie-3", trazo: "stroke-serie-3", muestra: "bg-serie-3" },
  { relleno: "fill-serie-4", trazo: "stroke-serie-4", muestra: "bg-serie-4" },
] as const;

const ANCHO = 640;
const ALTO = 260;
const MARGEN = { arriba: 12, derecha: 12, abajo: 32, izquierda: 88 };
const NUMERO = new Intl.NumberFormat("es-AR");

function colorDe(posicion: number) {
  return COLORES[posicion % COLORES.length] ?? COLORES[0];
}

export function Grafico({
  tipo,
  titulo,
  series,
}: {
  readonly tipo: "barras" | "lineas";
  readonly titulo: string;
  readonly series: readonly Serie[];
}) {
  const etiquetas = [
    ...new Set(series.flatMap(({ puntos }) => puntos.map((p) => p.etiqueta))),
  ];
  if (etiquetas.length === 0) {
    return <p className="text-texto-suave">No hay datos para mostrar.</p>;
  }
  const ancho = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const alto = ALTO - MARGEN.arriba - MARGEN.abajo;
  const valores = series.flatMap(({ puntos }) => puntos.map((p) => p.valor));
  const x = scaleBand<string>({
    domain: etiquetas,
    range: [0, ancho],
    padding: 0.2,
  });
  const y = scaleLinear<number>({
    domain: [Math.min(0, ...valores), Math.max(0, ...valores)],
    range: [alto, 0],
    nice: true,
  });
  const porSerie = scaleBand<number>({
    domain: series.map((_, posicion) => posicion),
    range: [0, x.bandwidth()],
    padding: 0.1,
  });
  const valorDe = (serie: Serie, etiqueta: string) =>
    serie.puntos.find((p) => p.etiqueta === etiqueta)?.valor;
  const mitad = (etiqueta: string) => (x(etiqueta) ?? 0) + x.bandwidth() / 2;

  return (
    <figure className="flex flex-col gap-2">
      <svg
        role="img"
        aria-label={titulo}
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-auto w-full"
      >
        <Group left={MARGEN.izquierda} top={MARGEN.arriba}>
          {y.ticks(4).map((marca) => (
            <line
              key={marca}
              x1={0}
              x2={ancho}
              y1={y(marca)}
              y2={y(marca)}
              className="stroke-borde"
            />
          ))}
          {tipo === "barras"
            ? series.flatMap((serie, posicion) =>
                etiquetas.flatMap((etiqueta) => {
                  const valor = valorDe(serie, etiqueta);
                  if (valor === undefined) {
                    return [];
                  }
                  return [
                    <Bar
                      key={`${serie.nombre}-${etiqueta}`}
                      x={(x(etiqueta) ?? 0) + (porSerie(posicion) ?? 0)}
                      y={Math.min(y(valor), y(0))}
                      width={porSerie.bandwidth()}
                      height={Math.abs(y(valor) - y(0))}
                      className={colorDe(posicion).relleno}
                    >
                      <title>{`${serie.nombre}, ${etiqueta}: ${NUMERO.format(valor)}`}</title>
                    </Bar>,
                  ];
                }),
              )
            : series.map((serie, posicion) => (
                <LinePath
                  key={serie.nombre}
                  data={[...serie.puntos]}
                  x={(punto) => mitad(punto.etiqueta)}
                  y={(punto) => y(punto.valor)}
                  strokeWidth={2}
                  className={`fill-none ${colorDe(posicion).trazo}`}
                />
              ))}
          <AxisLeft
            scale={y}
            numTicks={4}
            tickFormat={(valor) => NUMERO.format(Number(valor))}
            stroke="currentColor"
            tickStroke="currentColor"
            axisClassName="text-borde-control"
            tickLabelProps={{
              fill: "currentColor",
              className: "text-texto-suave text-xs",
            }}
          />
          <AxisBottom
            top={alto}
            scale={x}
            stroke="currentColor"
            tickStroke="currentColor"
            axisClassName="text-borde-control"
            tickLabelProps={{
              fill: "currentColor",
              className: "text-texto-suave text-xs",
            }}
          />
        </Group>
      </svg>
      {series.length > 1 ? (
        <ul data-leyenda className="flex flex-wrap gap-4 text-sm">
          {series.map(({ nombre }, posicion) => (
            <li key={nombre} className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-3 rounded-sm ${colorDe(posicion).muestra}`}
              />
              {nombre}
            </li>
          ))}
        </ul>
      ) : null}
      <table className="sr-only">
        <caption>{titulo}</caption>
        <thead>
          <tr>
            <td />
            {series.map(({ nombre }) => (
              <th key={nombre} scope="col">
                {nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {etiquetas.map((etiqueta) => (
            <tr key={etiqueta}>
              <th scope="row">{etiqueta}</th>
              {series.map((serie) => {
                const valor = valorDe(serie, etiqueta);
                return (
                  <td key={serie.nombre}>
                    {valor === undefined ? "" : NUMERO.format(valor)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
