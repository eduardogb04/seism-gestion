/**
 * El listado de cualquier ABM (F1-03, ADR 0031): buscador, orden, tabla y
 * paginado. Todo son enlaces y un formulario `GET`: el estado del listado vive
 * en la URL y lo resuelve la base, no el navegador.
 */

import type { Listado } from "../../casos-uso/abm/abm.ts";
import {
  camposDe,
  type DefinicionAbm,
  escritoDe,
} from "../../casos-uso/abm/definicion.ts";
import type { EntidadAbm } from "../../puertos/repositorios/abm.ts";
import { Boton, clasesDeBoton } from "./boton.tsx";
import { CampoTexto } from "./campo-texto.tsx";
import { Tabla } from "./tabla.tsx";

type Vista = {
  readonly buscar: string;
  readonly orden: string;
  readonly direccion: "asc" | "desc";
  readonly pagina: number;
};

function enlace(ruta: string, { buscar, orden, direccion, pagina }: Vista) {
  const parametros = new URLSearchParams({
    ...(buscar === "" ? {} : { buscar }),
    orden,
    direccion,
    pagina: String(pagina),
  });
  return `${ruta}?${parametros}`;
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
  const campos = camposDe(definicion);
  const etiquetas = new Map(
    campos.map(([nombre, campo]) => [nombre, campo.etiqueta]),
  );
  const { registros, total, pagina, paginas, buscar, orden, direccion } =
    listado;
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
          <a href={`${ruta}/nuevo`} className={clasesDeBoton("primario")}>
            Alta de {singular}
          </a>
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
              {etiquetas.get(columna)}
              {actual ? (direccion === "asc" ? " ↑" : " ↓") : ""}
            </a>
          );
        })}
      </p>
      <Tabla
        cabeceras={[
          ...campos.map(([, campo]) => campo.etiqueta),
          ...(puedeEscribir ? ["Acciones"] : []),
        ]}
      >
        {registros.map(({ valor }) => {
          const textos = escritoDe(valor);
          return (
            <tr key={valor.id}>
              {campos.map(([nombre]) => (
                <td key={nombre} className="whitespace-pre-line">
                  {textos[nombre]}
                </td>
              ))}
              {puedeEscribir ? (
                <td>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`${ruta}/${valor.id}`}
                      className={clasesDeBoton("secundario")}
                    >
                      Editar
                    </a>
                    <a
                      href={`${ruta}/${valor.id}/baja`}
                      className={clasesDeBoton("peligro")}
                    >
                      Dar de baja
                    </a>
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
