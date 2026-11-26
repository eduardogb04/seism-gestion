/**
 * El listado de cualquier ABM (F1-03, ADR 0031): buscador, tabla (se ordena
 * tocando el título de la columna) y paginado. Todo son enlaces y un
 * formulario `GET`: el estado del listado vive en la URL y lo resuelve la
 * base, no el navegador. Alta, edición y baja (F1-09)
 * son enlaces al mismo listado con un parámetro más (`nuevo`, `editar` o
 * `baja`) que abre la ventana, sin perder la búsqueda, el orden ni la página.
 */

import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Plus,
  Search,
  SearchX,
} from "lucide-react";
import type { ReactNode } from "react";
import type { FiltroListado } from "../../casos-uso/abm/abm.ts";
import { Boton, clasesDeBoton } from "./boton.tsx";
import { CLASES_DE_CONTROL } from "./campo-texto.tsx";
import { cn } from "./cn.ts";
import { Enlace } from "./enlace-next.ts";
import { Selector } from "./selector.tsx";
import {
  CLASES_DE_ACCIONES,
  CLASES_DE_ENLACE_DE_FILA,
  CLASES_DE_FILA_ENLAZADA,
  cabeceraOrdenable,
  Tabla,
} from "./tabla.tsx";

export type Vista = {
  readonly buscar: string;
  readonly orden: string;
  readonly direccion: "asc" | "desc";
  readonly pagina: number;
  /** Lo elegido en cada filtro, por columna; los que están en "todos" no figuran. */
  readonly filtros: Readonly<Record<string, string>>;
};

/** Lo que se dibuja de un listado: el de un ABM del molde o el de Servicios (F2-04). */
export type ListadoVisible = {
  readonly registros: readonly { readonly valor: { readonly id: string } }[];
  /** Las celdas de cada registro (por id), en el orden de las cabeceras. */
  readonly celdas: Readonly<Record<string, readonly string[]>>;
  readonly total: number;
  readonly pagina: number;
  readonly paginas: number;
  readonly buscar: string;
  readonly orden: string;
  readonly direccion: "asc" | "desc";
  readonly filtros: readonly FiltroListado[];
};

/** La vista que está mostrando un listado: es lo que se conserva al abrir y cerrar una ventana o cambiar de página. */
export function vistaDe({
  buscar,
  orden,
  direccion,
  pagina,
  filtros,
}: ListadoVisible): Vista {
  return {
    buscar,
    orden,
    direccion,
    pagina,
    filtros: Object.fromEntries(
      filtros
        .filter(({ elegido }) => elegido !== "")
        .map(({ columna, elegido }) => [columna, elegido]),
    ),
  };
}

export type VentanaPedida = {
  readonly clave: "nuevo" | "editar" | "baja";
  readonly valor: string;
};

/** Lo que va después del `?`: la vista del listado y, si hay, la ventana abierta. */
export function consultaDe(
  { buscar, orden, direccion, pagina, filtros }: Vista,
  ventana?: VentanaPedida,
): string {
  return new URLSearchParams({
    ...(buscar === "" ? {} : { buscar }),
    ...filtros,
    orden,
    direccion,
    pagina: String(pagina),
    ...(ventana === undefined ? {} : { [ventana.clave]: ventana.valor }),
  }).toString();
}

export function enlace(
  ruta: string,
  vista: Vista,
  ventana?: VentanaPedida,
): string {
  return `${ruta}?${consultaDe(vista, ventana)}`;
}

/** «Nuevo grupo», «Nueva cuenta»: el género sale de la primera palabra. */
export function textoDeNuevo(singular: string): string {
  const primera = singular.split(" ")[0] ?? "";
  return `${primera.endsWith("a") ? "Nueva" : "Nuevo"} ${singular}`;
}

/** Lo que se ve cuando el listado no tiene nada: ícono, una frase y qué hacer. */
function EstadoVacio({
  filtrado,
  limpiar,
  nuevo,
}: {
  readonly filtrado: boolean;
  readonly limpiar: string;
  readonly nuevo: ReactNode;
}) {
  const Icono = filtrado ? SearchX : Inbox;
  return (
    <div className="aparece flex flex-col items-center rounded-tarjeta border border-dashed border-borde-fuerte bg-superficie px-6 py-14 text-center">
      <span
        aria-hidden="true"
        className="mb-4 grid size-11 place-items-center rounded-full bg-superficie-2 text-texto-3"
      >
        <Icono className="size-5" />
      </span>
      <p data-total-del-listado className="m-0 text-[15px] font-medium">
        {filtrado
          ? "No encontramos nada con esa búsqueda."
          : "No hay nada para mostrar."}
      </p>
      <p className="mt-1 mb-5 max-w-sm text-texto-2">
        {filtrado
          ? "Probá con otras palabras o sacá los filtros."
          : "Todavía no se cargó nada acá."}
      </p>
      {filtrado ? (
        <Enlace href={limpiar} className={clasesDeBoton("secundario")}>
          Limpiar búsqueda
        </Enlace>
      ) : (
        nuevo
      )}
    </div>
  );
}

export function ListadoAbm({
  ruta,
  singular,
  cabeceras,
  ordenes,
  listado,
  puedeEscribir,
  acciones,
  rutaDeFila,
  sinCortar,
}: {
  readonly ruta: string;
  readonly singular: string;
  readonly cabeceras: readonly string[];
  /** Las columnas por las que se ordena: `etiqueta` es la cabecera que se toca para ordenar. */
  readonly ordenes: readonly {
    readonly columna: string;
    readonly etiqueta: string;
  }[];
  readonly listado: ListadoVisible;
  readonly puedeEscribir: boolean;
  /** Lo que se puede hacer con cada registro; `null`: el listado no lleva esa columna. */
  readonly acciones: ((id: string, vista: Vista) => ReactNode) | null;
  /** A dónde lleva la primera celda de cada fila; sin esto, es texto. */
  readonly rutaDeFila?: ((id: string) => string) | undefined;
  /** La cabecera de una columna cuyo texto no se parte en dos renglones (un código). */
  readonly sinCortar?: string;
}) {
  const {
    registros,
    celdas,
    total,
    pagina,
    paginas,
    buscar,
    orden,
    direccion,
    filtros,
  } = listado;
  const vista = vistaDe(listado);
  const nuevo = puedeEscribir ? (
    <Enlace
      href={enlace(ruta, vista, { clave: "nuevo", valor: "1" })}
      scroll={false}
      className={clasesDeBoton("primario")}
    >
      <Plus aria-hidden="true" />
      {textoDeNuevo(singular)}
    </Enlace>
  ) : null;
  const filtrado =
    buscar !== "" || filtros.some(({ elegido }) => elegido !== "");
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <search className="min-w-0 flex-1">
          <form action={ruta} className="flex flex-wrap items-end gap-2">
            <div className="relative w-full sm:w-72">
              <label htmlFor="buscar-en-listado" className="sr-only">
                Buscar
              </label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-texto-3"
              />
              <input
                id="buscar-en-listado"
                type="search"
                name="buscar"
                defaultValue={buscar}
                placeholder="Buscar…"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                className={cn(CLASES_DE_CONTROL, "pl-9")}
              />
            </div>
            {filtros.map(({ columna, etiqueta, opciones, elegido }) => (
              <Selector
                key={columna}
                etiqueta={etiqueta}
                etiquetaOculta
                name={columna}
                defaultValue={elegido}
                opciones={[
                  { valor: "", texto: `${etiqueta}: todos` },
                  ...opciones,
                ]}
              />
            ))}
            <input type="hidden" name="orden" value={orden} />
            <input type="hidden" name="direccion" value={direccion} />
            <Boton variante="secundario" type="submit">
              Buscar
            </Boton>
          </form>
        </search>
        {nuevo}
      </div>
      {total === 0 ? (
        <EstadoVacio
          filtrado={filtrado}
          limpiar={enlace(ruta, {
            ...vista,
            buscar: "",
            filtros: {},
            pagina: 1,
          })}
          nuevo={nuevo}
        />
      ) : (
        <>
          <Tabla
            cabeceras={[
              ...cabeceras.map((texto) => {
                const columna = ordenes.find(
                  ({ etiqueta }) => etiqueta === texto,
                )?.columna;
                if (columna === undefined) {
                  return texto;
                }
                return cabeceraOrdenable(
                  texto,
                  columna,
                  { orden, direccion },
                  (ordenNuevo, direccionNueva) =>
                    enlace(ruta, {
                      ...vista,
                      orden: ordenNuevo,
                      direccion: direccionNueva,
                      pagina: 1,
                    }),
                );
              }),
              ...(acciones === null ? [] : ["Acciones"]),
            ]}
          >
            {registros.map(({ valor }) => {
              return (
                <tr
                  key={valor.id}
                  className={
                    rutaDeFila === undefined
                      ? undefined
                      : CLASES_DE_FILA_ENLAZADA
                  }
                >
                  {(celdas[valor.id] ?? []).map((texto, posicion) => (
                    <td
                      key={cabeceras[posicion]}
                      className={
                        cabeceras[posicion] === sinCortar
                          ? "whitespace-nowrap"
                          : "whitespace-pre-line"
                      }
                    >
                      {posicion === 0 && rutaDeFila !== undefined ? (
                        <Enlace
                          href={rutaDeFila(valor.id)}
                          className={CLASES_DE_ENLACE_DE_FILA}
                        >
                          {texto}
                        </Enlace>
                      ) : (
                        texto
                      )}
                    </td>
                  ))}
                  {acciones === null ? null : (
                    <td className={CLASES_DE_ACCIONES}>
                      <div className="flex justify-end gap-1">
                        {acciones(valor.id, vista)}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </Tabla>
          <nav
            aria-label="Páginas del listado"
            className="mt-3 flex flex-wrap items-center justify-between gap-3"
          >
            <span
              data-total-del-listado
              className="cifras text-[13px] text-texto-2"
            >
              {`Página ${pagina} de ${paginas} · ${total} en total`}
            </span>
            {paginas > 1 ? (
              <span className="flex gap-2">
                {pagina > 1 ? (
                  <Enlace
                    href={enlace(ruta, { ...vista, pagina: pagina - 1 })}
                    className={clasesDeBoton("secundario", "h-8 px-2.5")}
                  >
                    <ChevronLeft aria-hidden="true" />
                    Anterior
                  </Enlace>
                ) : null}
                {pagina < paginas ? (
                  <Enlace
                    href={enlace(ruta, { ...vista, pagina: pagina + 1 })}
                    className={clasesDeBoton("secundario", "h-8 px-2.5")}
                  >
                    Siguiente
                    <ChevronRight aria-hidden="true" />
                  </Enlace>
                ) : null}
              </span>
            ) : null}
          </nav>
        </>
      )}
    </>
  );
}
