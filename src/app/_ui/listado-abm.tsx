/**
 * El listado de cualquier ABM (F1-03, ADR 0031): buscador, orden, tabla y
 * paginado. Todo son enlaces y un formulario `GET`: el estado del listado vive
 * en la URL y lo resuelve la base, no el navegador. Alta, edición y baja (F1-09)
 * son enlaces al mismo listado con un parámetro más (`nuevo`, `editar` o
 * `baja`) que abre la ventana, sin perder la búsqueda, el orden ni la página.
 */

import type { ReactNode } from "react";
import type { FiltroListado } from "../../casos-uso/abm/abm.ts";
import { Boton, clasesDeBoton } from "./boton.tsx";
import { CampoTexto } from "./campo-texto.tsx";
import { Enlace } from "./enlace-next.ts";
import { Selector } from "./selector.tsx";
import { Tabla } from "./tabla.tsx";

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

export function ListadoAbm({
  ruta,
  singular,
  cabeceras,
  ordenes,
  listado,
  puedeEscribir,
  acciones,
}: {
  readonly ruta: string;
  readonly singular: string;
  readonly cabeceras: readonly string[];
  /** Las columnas por las que se ordena, con lo que dice su enlace. */
  readonly ordenes: readonly {
    readonly columna: string;
    readonly etiqueta: string;
  }[];
  readonly listado: ListadoVisible;
  readonly puedeEscribir: boolean;
  /** Lo que se puede hacer con cada registro; `null`: el listado no lleva esa columna. */
  readonly acciones: ((id: string, vista: Vista) => ReactNode) | null;
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
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form action={ruta} className="flex flex-wrap items-end gap-3">
          <CampoTexto
            etiqueta="Buscar"
            type="search"
            name="buscar"
            defaultValue={buscar}
          />
          {filtros.map(({ columna, etiqueta, opciones, elegido }) => (
            <Selector
              key={columna}
              etiqueta={etiqueta}
              name={columna}
              defaultValue={elegido}
              opciones={[{ valor: "", texto: "Todos" }, ...opciones]}
            />
          ))}
          <input type="hidden" name="orden" value={orden} />
          <input type="hidden" name="direccion" value={direccion} />
          <Boton variante="secundario" type="submit">
            Buscar
          </Boton>
        </form>
        {puedeEscribir ? (
          <Enlace
            href={enlace(ruta, vista, { clave: "nuevo", valor: "1" })}
            scroll={false}
            className={clasesDeBoton("primario")}
          >
            Alta de {singular}
          </Enlace>
        ) : null}
      </div>
      <p className="mb-2 flex flex-wrap gap-3">
        Ordenar por:
        {ordenes.map(({ columna, etiqueta }) => {
          const actual = columna === orden;
          const alReves = actual && direccion === "asc" ? "desc" : "asc";
          return (
            <a
              key={columna}
              href={enlace(ruta, {
                ...vista,
                orden: columna,
                direccion: alReves,
                pagina: 1,
              })}
            >
              {etiqueta}
              {actual ? (direccion === "asc" ? " ↑" : " ↓") : ""}
            </a>
          );
        })}
      </p>
      <Tabla
        cabeceras={[...cabeceras, ...(acciones === null ? [] : ["Acciones"])]}
      >
        {registros.map(({ valor }) => {
          return (
            <tr key={valor.id}>
              {(celdas[valor.id] ?? []).map((texto, posicion) => (
                <td key={cabeceras[posicion]} className="whitespace-pre-line">
                  {texto}
                </td>
              ))}
              {acciones === null ? null : (
                <td>
                  <div className="flex flex-wrap gap-2">
                    {acciones(valor.id, vista)}
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      </Tabla>
      <p className="mt-3 flex flex-wrap items-center gap-3">
        <span data-total-del-listado>
          {total === 0
            ? "No hay nada para mostrar."
            : `Página ${pagina} de ${paginas} · ${total} en total`}
        </span>
        {pagina > 1 ? (
          <a href={enlace(ruta, { ...vista, pagina: pagina - 1 })}>Anterior</a>
        ) : null}
        {pagina < paginas ? (
          <a href={enlace(ruta, { ...vista, pagina: pagina + 1 })}>Siguiente</a>
        ) : null}
      </p>
    </>
  );
}
