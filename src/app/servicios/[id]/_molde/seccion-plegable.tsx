"use client";

/**
 * Una sección que se abre y se cierra (modern-web-guidance: accordion, la
 * variante con encabezado propio): el botón va dentro del título, así la
 * sección sigue siendo un encabezado para quien navega por títulos. Recuerda
 * su estado en la cookie `secciones`, que el servidor lee para dibujarla igual
 * la próxima vez (sin parpadeo). La dibuja `Seccion`, no un panel directo.
 */

import { ChevronDown } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

export const COOKIE_DE_SECCIONES = "secciones";

/** `clave:1` abierta, `clave:0` cerrada, separadas por coma. */
function recordar(clave: string, abierta: boolean): void {
  const actual =
    document.cookie
      .split("; ")
      .find((par) => par.startsWith(`${COOKIE_DE_SECCIONES}=`))
      ?.slice(COOKIE_DE_SECCIONES.length + 1) ?? "";
  const otras = decodeURIComponent(actual)
    .split(",")
    .filter((par) => par !== "" && !par.startsWith(`${clave}:`))
    .slice(-60);
  const valor = encodeURIComponent(
    [...otras, `${clave}:${abierta ? 1 : 0}`].join(","),
  );
  // biome-ignore lint/suspicious/noDocumentCookie: una preferencia de vista, sin dato sensible; la lee el servidor
  document.cookie = `${COOKIE_DE_SECCIONES}=${valor}; path=/; max-age=31536000; samesite=lax`;
}

export function SeccionPlegable({
  clave,
  titulo,
  resumen,
  extra,
  abiertaAlEmpezar,
  children,
}: {
  readonly clave: string;
  readonly titulo: string;
  readonly resumen?: ReactNode;
  readonly extra?: ReactNode;
  readonly abiertaAlEmpezar: boolean;
  readonly children: ReactNode;
}) {
  const [abierta, setAbierta] = useState(abiertaAlEmpezar);
  const id = useId();
  return (
    <section
      aria-labelledby={`${id}-titulo`}
      data-seccion={clave}
      className="border-t border-borde first:border-t-0"
    >
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2">
        <h3 id={`${id}-titulo`} className="m-0 text-sm font-semibold">
          <button
            type="button"
            aria-expanded={abierta}
            aria-controls={`${id}-contenido`}
            onClick={() => {
              setAbierta(!abierta);
              recordar(clave, !abierta);
            }}
            className="presionable -ml-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-control px-1.5 py-1 text-texto hover:bg-superficie-2 pointer-coarse:min-h-11"
          >
            <ChevronDown
              aria-hidden="true"
              className="seccion-plegable__flecha size-4 text-texto-3"
            />
            {titulo}
          </button>
        </h3>
        {resumen === undefined ? null : (
          <span className="cifras text-[13px] text-texto-3">{resumen}</span>
        )}
        {extra === undefined ? null : (
          <div className="ml-auto flex items-center gap-1">{extra}</div>
        )}
      </div>
      <div
        id={`${id}-contenido`}
        hidden={!abierta}
        className="seccion-plegable__contenido pb-5"
      >
        {children}
      </div>
    </section>
  );
}
