import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Una cabecera: su texto o, si la columna ordena, también el enlace que la
 * ordena y el sentido actual (`null`: hoy se ordena por otra).
 */
type Cabecera =
  | string
  | {
      readonly texto: string;
      readonly orden: {
        readonly sentido: "asc" | "desc" | null;
        readonly enlace: string;
      };
    };

/**
 * La cabecera de una columna que ordena: la ordena en el sentido contrario al
 * de hoy si ya es la actual, y de menor a mayor si no. `enlaceA` arma la
 * dirección con el orden y el sentido que le tocan.
 */
export function cabeceraOrdenable(
  texto: string,
  columna: string,
  actual: { readonly orden: string; readonly direccion: "asc" | "desc" },
  enlaceA: (orden: string, direccion: "asc" | "desc") => string,
): Cabecera {
  const esLaActual = columna === actual.orden;
  return {
    texto,
    orden: {
      sentido: esLaActual ? actual.direccion : null,
      enlace: enlaceA(
        columna,
        esLaActual && actual.direccion === "asc" ? "desc" : "asc",
      ),
    },
  };
}

/** El `<tr>` de una fila que lleva a un detalle: relativo, para que el enlace de su primera celda la cubra entera. */
export const CLASES_DE_FILA_ENLAZADA =
  "relative cursor-pointer hover:bg-superficie-alta";

/**
 * El enlace de la primera celda se estira a toda la fila (`::after` sobre el
 * `<tr>` relativo): toda la fila lleva al detalle y, como es un `<a>`, anda
 * con Tab y Enter sin JavaScript. El foco se dibuja alrededor de la fila.
 */
export const CLASES_DE_ENLACE_DE_FILA =
  "font-medium no-underline after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-acento";

/** La celda de lo que se hace con la fila: queda encima del enlace de la fila entera. */
export const CLASES_DE_ACCIONES = "relative z-10";

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

function CabeceraOrdenable({
  texto,
  sentido,
  enlace,
}: {
  readonly texto: string;
  readonly sentido: "asc" | "desc" | null;
  readonly enlace: string;
}) {
  const Icono =
    sentido === "asc"
      ? ArrowUp
      : sentido === "desc"
        ? ArrowDown
        : ChevronsUpDown;
  return (
    <th aria-sort={sentido === null ? undefined : ARIA_SORT[sentido]}>
      <a
        href={enlace}
        title={`Ordenar por ${texto}`}
        className="inline-flex items-center gap-1 text-texto no-underline hover:underline"
      >
        {texto}
        <Icono
          aria-hidden="true"
          className={`size-4 shrink-0 ${sentido === null ? "text-texto-suave" : "text-acento"}`}
        />
      </a>
    </th>
  );
}

/**
 * Cabecera y filas. Las filas (`<tr>`) las arma quien la usa; el estilo de las
 * celdas lo da la tabla. En pantallas angostas hace scroll dentro de su
 * contenedor, no de la página.
 */
export function Tabla({
  cabeceras,
  children,
}: {
  readonly cabeceras: readonly Cabecera[];
  readonly children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded border border-borde bg-superficie">
      <table className="w-full border-collapse text-left tabular-nums [&_td]:border-t [&_td]:border-borde [&_td]:px-3 [&_td]:py-2 [&_th]:bg-superficie-alta [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold">
        <thead>
          <tr>
            {cabeceras.map((cabecera) =>
              typeof cabecera === "string" ? (
                <th key={cabecera}>{cabecera}</th>
              ) : (
                <CabeceraOrdenable
                  key={cabecera.texto}
                  texto={cabecera.texto}
                  sentido={cabecera.orden.sentido}
                  enlace={cabecera.orden.enlace}
                />
              ),
            )}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
