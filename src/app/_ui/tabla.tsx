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
  "relative cursor-pointer hover:bg-superficie-2";

/**
 * El enlace de la primera celda se estira a toda la fila (`::after` sobre el
 * `<tr>` relativo): toda la fila lleva al detalle y, como es un `<a>`, anda
 * con Tab y Enter sin JavaScript. El foco se dibuja alrededor de la fila.
 */
export const CLASES_DE_ENLACE_DE_FILA =
  "font-medium text-texto no-underline after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-acento";

/** La celda de lo que se hace con la fila: queda encima del enlace de la fila entera. */
export const CLASES_DE_ACCIONES = "relative z-10";

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

function CabeceraOrdenable({
  texto,
  sentido,
  enlace,
  clases,
}: {
  readonly clases?: string | undefined;
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
    <th
      scope="col"
      className={clases}
      aria-sort={sentido === null ? undefined : ARIA_SORT[sentido]}
    >
      <a
        href={enlace}
        title={`Ordenar por ${texto}`}
        className={`group -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 no-underline hover:bg-superficie-3 hover:text-texto ${sentido === null ? "text-texto-2" : "text-texto"}`}
      >
        {texto}
        <Icono
          aria-hidden="true"
          className={`size-3.5 shrink-0 ${sentido === null ? "text-texto-3 opacity-60 group-hover:opacity-100" : "text-acento"}`}
        />
      </a>
    </th>
  );
}

/**
 * Cabecera y filas. Las filas (`<tr>`) las arma quien la usa; el estilo de las
 * celdas lo da la tabla. En pantallas angostas hace scroll dentro de su
 * contenedor (una región con nombre a la que se llega con Tab), no de la
 * página (modern-web-guidance: responsive-table). `titulo` es el `<caption>`,
 * solo para lectores de pantalla; sin él, se nombra por sus columnas.
 */
export function Tabla({
  cabeceras,
  titulo,
  derecha = [],
  ocultas = [],
  children,
}: {
  /** Posiciones de las columnas de cifras, alineadas a la derecha. */
  readonly derecha?: readonly number[];
  /** Posiciones de las columnas que se esconden bajo 1024 px. */
  readonly ocultas?: readonly number[];
  readonly cabeceras: readonly Cabecera[];
  readonly titulo?: string | undefined;
  readonly children: ReactNode;
}) {
  // Sin hooks: algunas pantallas la llaman como función.
  const nombre = titulo ?? "Tabla";
  return (
    <section
      // biome-ignore lint/a11y/noNoninteractiveTabindex: la región desplazable se recorre con el teclado (responsive-table)
      tabIndex={0}
      aria-label={nombre}
      className="overflow-x-auto overscroll-x-contain rounded-tarjeta border border-borde bg-superficie shadow-tarjeta focus-visible:outline-offset-1"
    >
      <table className="cifras w-full border-separate border-spacing-0 text-left text-sm [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-150 [&_tbody_tr:hover]:bg-superficie-2 [&_tbody_tr:last-child_td]:border-b-0 [&_td]:h-11 [&_td]:min-w-32 [&_td:last-child]:min-w-0 [&_td]:border-b [&_td]:border-borde [&_td]:px-4 [&_td]:py-2 [&_th]:h-9 [&_th]:border-b [&_th]:border-borde [&_th]:bg-superficie-2 [&_th]:px-4 [&_th]:text-xs [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:text-texto-2">
        <caption className="sr-only">{nombre}</caption>
        <thead>
          <tr>
            {cabeceras.map((cabecera, posicion) => {
              const clases =
                [
                  derecha.includes(posicion) ? "text-right" : "",
                  ocultas.includes(posicion) ? "hidden lg:table-cell" : "",
                ]
                  .filter((c) => c !== "")
                  .join(" ") || undefined;
              return typeof cabecera === "string" ? (
                <th key={cabecera} scope="col" className={clases}>
                  {cabecera}
                </th>
              ) : (
                <CabeceraOrdenable
                  clases={clases}
                  key={cabecera.texto}
                  texto={cabecera.texto}
                  sentido={cabecera.orden.sentido}
                  enlace={cabecera.orden.enlace}
                />
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}
