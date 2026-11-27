/**
 * El listado de cualquier ABM (F1-03, ADR 0031): buscador, tabla (se ordena
 * tocando el título de la columna) y paginado. Todo son enlaces y un
 * formulario `GET`: el estado del listado vive en la URL y lo resuelve la
 * base, no el navegador. Alta, edición y baja (F1-09)
 * son enlaces al mismo listado con un parámetro más (`nuevo`, `editar` o
 * `baja`) que abre la ventana, sin perder la búsqueda, el orden ni la página.
 */

import { Inbox, Plus, Search, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import type { FiltroListado } from "../../casos-uso/abm/abm.ts";
import { ListaDeTarjetas, Paginas, TarjetaDeFila } from "../_plata/piezas.tsx";
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
  plural,
  limpiar,
  nuevo,
}: {
  readonly filtrado: boolean;
  readonly plural: string;
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
          : `Todavía no hay ${plural.toLowerCase()}.`}
      </p>
      <p className="mt-1 mb-5 max-w-sm text-texto-2">
        {filtrado
          ? "Probá con otras palabras o sacá los filtros."
          : nuevo === null
            ? "Todavía no se cargó nada acá."
            : "Cargá el primero."}
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

/** El buscador y los filtros de un listado: un formulario `GET` que conserva el orden. */
export function BuscadorDeListado({
  ruta,
  buscar,
  filtros,
  orden,
  direccion,
}: {
  readonly ruta: string;
  readonly buscar: string;
  readonly filtros: readonly FiltroListado[];
  readonly orden: string;
  readonly direccion: "asc" | "desc";
}) {
  return (
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
          opciones={[{ valor: "", texto: `${etiqueta}: todos` }, ...opciones]}
        />
      ))}
      <input type="hidden" name="orden" value={orden} />
      <input type="hidden" name="direccion" value={direccion} />
      <Boton variante="secundario" type="submit">
        Buscar
      </Boton>
    </form>
  );
}

/** Cómo se dibuja cada columna del listado: `calculada` se resuelve mirando sus celdas. */
export type TipoDeColumna = "texto" | "cifra" | "estado" | "calculada";

const ES_NUMERO = /^[\d.,]+(\s\S+)?$/;

/** Un botón de ícono de una fila: lleva a la ventana de edición o de baja. */
export function AccionDeFila({
  href,
  texto,
  peligro = false,
  children,
}: {
  readonly href: string;
  readonly texto: string;
  readonly peligro?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Enlace
      href={href}
      scroll={false}
      aria-label={texto}
      title={texto}
      className={cn(
        "presionable grid size-8 place-items-center rounded-md text-texto-2 no-underline hover:bg-superficie-3",
        peligro ? "hover:text-peligro" : "hover:text-texto",
      )}
    >
      {children}
    </Enlace>
  );
}

/** Activo o inactivo, como una etiqueta chica. */
function ChipDeEstado({ activo }: { readonly activo: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        activo ? "bg-exito-suave text-exito" : "bg-superficie-3 text-texto-2",
      )}
    >
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}

export function ListadoAbm({
  ruta,
  singular,
  plural,
  titulo,
  bajada,
  cabeceras,
  tipos,
  ordenes,
  listado,
  puedeEscribir,
  acciones,
  rutaDeFila,
}: {
  readonly ruta: string;
  readonly singular: string;
  readonly plural: string;
  /** El título de la pantalla. */
  readonly titulo: string;
  /** Una frase corta debajo del título. */
  readonly bajada?: string | undefined;
  readonly cabeceras: readonly string[];
  /** Cómo se dibuja cada columna; las que faltan, como texto. */
  readonly tipos?: readonly TipoDeColumna[];
  /** Las columnas por las que se ordena: `etiqueta` es la cabecera que se toca para ordenar. */
  readonly ordenes: readonly {
    readonly columna: string;
    readonly etiqueta: string;
  }[];
  readonly listado: ListadoVisible;
  readonly puedeEscribir: boolean;
  /** Los íconos de lo que se puede hacer con cada registro; `null`: el listado no lleva esa columna. */
  readonly acciones: ((id: string, vista: Vista) => ReactNode) | null;
  /** A dónde lleva la primera celda de cada fila; sin esto, es texto. */
  readonly rutaDeFila?: ((id: string) => string) | undefined;
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
  const filtrado =
    buscar !== "" || filtros.some(({ elegido }) => elegido !== "");
  const boton = (
    <Enlace
      href={enlace(ruta, vista, { clave: "nuevo", valor: "1" })}
      scroll={false}
      className={clasesDeBoton("primario")}
    >
      <Plus aria-hidden="true" />
      {textoDeNuevo(singular)}
    </Enlace>
  );
  const vacioSinFiltro = total === 0 && !filtrado;
  const columnas = cabeceras.map((cabecera, posicion) => {
    const pedido = tipos?.[posicion] ?? "texto";
    const llenas = registros
      .map(({ valor }) => celdas[valor.id]?.[posicion] ?? "")
      .filter((texto) => texto !== "");
    const tipo: Exclude<TipoDeColumna, "calculada"> =
      pedido !== "calculada"
        ? pedido
        : llenas.length > 0 && llenas.every((t) => ES_NUMERO.test(t))
          ? "cifra"
          : "texto";
    return { cabecera, tipo, secundaria: posicion >= 4 };
  });
  const vinculo = (id: string) => rutaDeFila?.(id) ?? null;
  const aPagina = (numero: number) =>
    enlace(ruta, { ...vista, pagina: numero });
  const posicionDeEstado = columnas.findIndex(({ tipo }) => tipo === "estado");
  return (
    <>
      <header className="aparece flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 text-[24px] leading-8 font-semibold tracking-tight">
            {titulo}
          </h1>
          {bajada === undefined ? null : (
            <p className="m-0 mt-1 text-texto-2">{bajada}</p>
          )}
        </div>
        {puedeEscribir && !vacioSinFiltro ? boton : null}
      </header>
      {vacioSinFiltro ? null : (
        <search>
          <BuscadorDeListado
            ruta={ruta}
            buscar={buscar}
            filtros={filtros}
            orden={orden}
            direccion={direccion}
          />
        </search>
      )}
      {total === 0 ? (
        <EstadoVacio
          filtrado={filtrado}
          plural={plural}
          limpiar={enlace(ruta, {
            ...vista,
            buscar: "",
            filtros: {},
            pagina: 1,
          })}
          nuevo={puedeEscribir ? boton : null}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Tabla
              titulo={titulo}
              derecha={columnas.flatMap(({ tipo }, i) =>
                tipo === "cifra" ? [i] : [],
              )}
              ocultas={columnas.flatMap(({ secundaria }, i) =>
                secundaria ? [i] : [],
              )}
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
                const destino = vinculo(valor.id);
                return (
                  <tr
                    key={valor.id}
                    className={
                      destino === null ? undefined : CLASES_DE_FILA_ENLAZADA
                    }
                  >
                    {(celdas[valor.id] ?? []).map((texto, posicion) => {
                      const { tipo, secundaria } = columnas[posicion] ?? {
                        tipo: "texto",
                        secundaria: false,
                      };
                      return (
                        <td
                          key={cabeceras[posicion]}
                          className={cn(
                            "whitespace-nowrap",
                            posicion === 0 ? "w-full max-w-0" : "text-texto-2",
                            tipo === "cifra" && "cifras text-right",
                            secundaria && "hidden lg:table-cell",
                          )}
                        >
                          {tipo === "estado" ? (
                            <ChipDeEstado activo={texto === "Sí"} />
                          ) : posicion === 0 && destino !== null ? (
                            <Enlace
                              href={destino}
                              title={texto}
                              className={cn(
                                CLASES_DE_ENLACE_DE_FILA,
                                "block truncate",
                              )}
                            >
                              {texto}
                            </Enlace>
                          ) : texto === "" ? (
                            <span className="text-texto-3">—</span>
                          ) : (
                            <span
                              title={texto}
                              className={cn(
                                "block truncate",
                                posicion === 0
                                  ? "font-medium text-texto"
                                  : "max-w-64",
                                tipo === "cifra" && "ml-auto",
                              )}
                            >
                              {texto}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    {acciones === null ? null : (
                      <td
                        className={cn(CLASES_DE_ACCIONES, "whitespace-nowrap")}
                      >
                        <div className="flex justify-end gap-0.5">
                          {acciones(valor.id, vista)}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </Tabla>
          </div>
          <ListaDeTarjetas>
            {registros.map(({ valor }) => {
              const textos = celdas[valor.id] ?? [];
              return (
                <TarjetaDeFila
                  key={valor.id}
                  href={vinculo(valor.id)}
                  titulo={<span className="block truncate">{textos[0]}</span>}
                  derecha={
                    posicionDeEstado < 0 ? undefined : (
                      <ChipDeEstado
                        activo={textos[posicionDeEstado] === "Sí"}
                      />
                    )
                  }
                  accion={
                    acciones === null ? undefined : (
                      <div className="flex justify-end gap-0.5">
                        {acciones(valor.id, vista)}
                      </div>
                    )
                  }
                >
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-texto-2">
                    {columnas
                      .map(({ cabecera, tipo }, posicion) => ({
                        cabecera,
                        tipo,
                        posicion,
                        texto: textos[posicion] ?? "",
                      }))
                      .filter(
                        ({ tipo, texto, posicion }) =>
                          posicion > 0 && tipo !== "estado" && texto !== "",
                      )
                      .slice(0, 3)
                      .map(({ cabecera, texto }) => (
                        <span key={cabecera} className="min-w-0 truncate">
                          <span className="text-texto-3">{cabecera}</span>{" "}
                          {texto}
                        </span>
                      ))}
                  </span>
                </TarjetaDeFila>
              );
            })}
          </ListaDeTarjetas>
          <Paginas
            texto={`Página ${pagina} de ${paginas} · ${total} en total`}
            anterior={pagina > 1 ? aPagina(pagina - 1) : null}
            siguiente={pagina < paginas ? aPagina(pagina + 1) : null}
          />
        </>
      )}
    </>
  );
}
