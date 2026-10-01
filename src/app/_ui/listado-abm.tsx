/**
 * El listado de cualquier ABM (F1-03, ADR 0031): buscador, orden, tabla y
 * paginado. Todo son enlaces y un formulario `GET`: el estado del listado vive
 * en la URL y lo resuelve la base, no el navegador. Alta, edición y baja (F1-09)
 * son enlaces al mismo listado con un parámetro más (`nuevo`, `editar` o
 * `baja`) que abre la ventana, sin perder la búsqueda, el orden ni la página.
 */

import type { Listado } from "../../casos-uso/abm/abm.ts";
import {
  cabecerasDe,
  type DefinicionAbm,
} from "../../casos-uso/abm/definicion.ts";
import type { EntidadAbm } from "../../puertos/repositorios/abm.ts";
import { Boton, clasesDeBoton } from "./boton.tsx";
import { CampoTexto } from "./campo-texto.tsx";
import { Enlace } from "./enlace-next.ts";
import { Tabla } from "./tabla.tsx";

export type Vista = {
  readonly buscar: string;
  readonly orden: string;
  readonly direccion: "asc" | "desc";
  readonly pagina: number;
};

export type VentanaPedida = {
  readonly clave: "nuevo" | "editar" | "baja";
  readonly valor: string;
};

/** Lo que va después del `?`: la vista del listado y, si hay, la ventana abierta. */
export function consultaDe(
  { buscar, orden, direccion, pagina }: Vista,
  ventana?: VentanaPedida,
): string {
  return new URLSearchParams({
    ...(buscar === "" ? {} : { buscar }),
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

export function ListadoAbm<E extends EntidadAbm>({
  definicion,
  listado,
  puedeEscribir,
}: {
  readonly definicion: DefinicionAbm<E>;
  readonly listado: Listado<E>;
  readonly puedeEscribir: boolean;
}) {
  const { ruta, singular } = definicion;
  const cabeceras = cabecerasDe(definicion);
  const {
    registros,
    celdas,
    total,
    pagina,
    paginas,
    buscar,
    orden,
    direccion,
  } = listado;
  const vista: Vista = { buscar, orden, direccion, pagina };
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
        {definicion.orden.map((columna) => {
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
              {definicion.campos[columna].etiqueta}
              {actual ? (direccion === "asc" ? " ↑" : " ↓") : ""}
            </a>
          );
        })}
      </p>
      <Tabla cabeceras={[...cabeceras, ...(puedeEscribir ? ["Acciones"] : [])]}>
        {registros.map(({ valor }) => {
          return (
            <tr key={valor.id}>
              {(celdas[valor.id] ?? []).map((texto, posicion) => (
                <td key={cabeceras[posicion]} className="whitespace-pre-line">
                  {texto}
                </td>
              ))}
              {puedeEscribir ? (
                <td>
                  <div className="flex flex-wrap gap-2">
                    <Enlace
                      href={enlace(ruta, vista, {
                        clave: "editar",
                        valor: valor.id,
                      })}
                      scroll={false}
                      className={clasesDeBoton("secundario")}
                    >
                      Editar
                    </Enlace>
                    <Enlace
                      href={enlace(ruta, vista, {
                        clave: "baja",
                        valor: valor.id,
                      })}
                      scroll={false}
                      className={clasesDeBoton("peligro")}
                    >
                      Dar de baja
                    </Enlace>
                  </div>
                </td>
              ) : null}
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
