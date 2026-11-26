/**
 * La vista tabla: orden por columna, fila entera clicable y paginado. En
 * celular, las filas pasan a tarjetas.
 */

import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { ESTADOS_SERVICIO } from "../../../dominio/servicios/estados.ts";
import type { ServicioDelListado } from "../../../server/servicios.ts";
import { cn } from "../../_ui/cn.ts";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ChipDeEtapa } from "../../_ui/etapa.tsx";
import {
  CLASES_DE_ENLACE_DE_FILA,
  CLASES_DE_FILA_ENLAZADA,
  cabeceraOrdenable,
  Tabla,
} from "../../_ui/tabla.tsx";
import { enlaceDelListado, type ParametrosDelListado } from "./enlaces.ts";
import {
  diasEnLaEtapa,
  Importe,
  Persona,
  TarjetaDeServicio,
  Vencimiento,
} from "./piezas.tsx";

const POR_PAGINA = 25;

export const COLUMNAS = {
  codigo: "Código",
  titulo: "Título",
  cliente: "Cliente",
  tipo: "Tipo",
  etapa: "Etapa",
  responsable: "Responsable",
  importe: "Importe",
  dias: "En la etapa",
  vencimiento: "Próx. vencimiento",
} as const;

export type Columna = keyof typeof COLUMNAS;

export function esColumna(valor: string | undefined): valor is Columna {
  return valor !== undefined && valor in COLUMNAS;
}

const texto = (a: string, b: string) => a.localeCompare(b, "es");

const COMPARAR: Record<
  Columna,
  (a: ServicioDelListado, b: ServicioDelListado) => number
> = {
  codigo: (a, b) => texto(a.codigo, b.codigo),
  titulo: (a, b) => texto(a.titulo, b.titulo),
  cliente: (a, b) => texto(a.cliente.nombre, b.cliente.nombre),
  tipo: (a, b) => texto(a.tipo.nombre, b.tipo.nombre),
  etapa: (a, b) =>
    ESTADOS_SERVICIO.indexOf(a.etapa) - ESTADOS_SERVICIO.indexOf(b.etapa),
  responsable: (a, b) => texto(a.responsable.nombre, b.responsable.nombre),
  // Sin convertir: primero por moneda, después por monto; sin importe, al final.
  importe: (a, b) =>
    a.importe === null || b.importe === null
      ? Number(a.importe === null) - Number(b.importe === null)
      : texto(a.importe.moneda, b.importe.moneda) ||
        a.importe.centavos - b.importe.centavos,
  dias: (a, b) => a.dias - b.dias,
  vencimiento: (a, b) =>
    a.aviso === null || b.aviso === null
      ? Number(a.aviso === null) - Number(b.aviso === null)
      : texto(a.aviso.fecha, b.aviso.fecha),
};

export function TablaDeServicios({
  servicios,
  parametros,
  orden,
  direccion,
  pagina: pedida,
}: {
  readonly servicios: readonly ServicioDelListado[];
  readonly parametros: ParametrosDelListado;
  readonly orden: Columna;
  readonly direccion: "asc" | "desc";
  readonly pagina: number;
}) {
  const signo = direccion === "asc" ? 1 : -1;
  const ordenados = [...servicios].sort(
    (a, b) => signo * COMPARAR[orden](a, b) || texto(b.codigo, a.codigo),
  );
  const paginas = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, pedida), paginas);
  const visibles = ordenados.slice(
    (pagina - 1) * POR_PAGINA,
    pagina * POR_PAGINA,
  );

  if (servicios.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-tarjeta border border-borde bg-superficie px-5 py-16 text-center shadow-tarjeta">
        <SearchX
          aria-hidden="true"
          className="size-8 text-texto-3"
          strokeWidth={1.5}
        />
        <p className="m-0 font-medium">Ningún servicio coincide</p>
        <p className="m-0 text-texto-2">
          Probá con otra búsqueda o sacá algún filtro.
        </p>
      </div>
    );
  }

  const cabeceras = (Object.keys(COLUMNAS) as Columna[]).map((columna) =>
    cabeceraOrdenable(
      COLUMNAS[columna],
      columna,
      { orden, direccion },
      (o, d) => enlaceDelListado(parametros, { orden: o, direccion: d }),
    ),
  );

  return (
    <div className="flex flex-col gap-3">
      {/* El tipo tiene columna propia en pantallas anchas; en las otras va debajo del título. */}
      <div className="hidden md:block [&_td]:text-[13px] [&_th]:text-[12px] [&_th]:whitespace-nowrap max-2xl:[&_td:nth-child(4)]:hidden max-2xl:[&_th:nth-child(4)]:hidden">
        <Tabla cabeceras={cabeceras}>
          {visibles.map((s) => (
            <tr key={s.id} className={CLASES_DE_FILA_ENLAZADA}>
              <td className="whitespace-nowrap">
                <Enlace
                  href={s.enlace}
                  className={cn(
                    CLASES_DE_ENLACE_DE_FILA,
                    "font-mono text-[12px] text-texto",
                  )}
                >
                  {s.codigo}
                </Enlace>
              </td>
              <td className="min-w-44 max-w-56">
                <span className="line-clamp-2 font-medium">{s.titulo}</span>
                <span className="block truncate text-[12px] text-texto-3 2xl:hidden">
                  {s.tipo.nombre}
                </span>
              </td>
              <td className="max-w-36 truncate text-texto-2">
                {s.cliente.nombre}
              </td>
              <td className="max-w-32 truncate text-texto-2">
                {s.tipo.nombre}
              </td>
              <td>
                <ChipDeEtapa etapa={s.etapa} />
              </td>
              <td className="max-w-36 whitespace-nowrap">
                <Persona persona={s.responsable} />
              </td>
              <td className="text-right">
                {s.importe ? (
                  <Importe texto={s.importe.texto} />
                ) : (
                  <span className="text-texto-3">—</span>
                )}
              </td>
              <td className="cifras text-right whitespace-nowrap text-texto-2">
                {diasEnLaEtapa(s.dias)}
              </td>
              <td className="whitespace-nowrap">
                {s.aviso ? (
                  <span title={s.aviso.que} className="flex">
                    <Vencimiento aviso={s.aviso} />
                  </span>
                ) : (
                  <span className="text-texto-3">—</span>
                )}
              </td>
            </tr>
          ))}
        </Tabla>
      </div>

      <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
        {visibles.map((s) => (
          <li key={s.id}>
            <TarjetaDeServicio servicio={s} />
          </li>
        ))}
      </ul>

      <Paginado
        total={ordenados.length}
        pagina={pagina}
        paginas={paginas}
        parametros={parametros}
      />
    </div>
  );
}

function Paginado({
  total,
  pagina,
  paginas,
  parametros,
}: {
  readonly total: number;
  readonly pagina: number;
  readonly paginas: number;
  readonly parametros: ParametrosDelListado;
}) {
  const desde = (pagina - 1) * POR_PAGINA + 1;
  const hasta = Math.min(total, pagina * POR_PAGINA);
  const boton =
    "presionable grid size-9 place-items-center rounded-md border border-borde bg-superficie text-texto-2 no-underline shadow-tarjeta hover:border-borde-fuerte hover:text-texto aria-disabled:pointer-events-none aria-disabled:opacity-40";
  return (
    <nav
      aria-label="Páginas"
      className="flex items-center justify-between gap-3 text-[13px] text-texto-2"
    >
      <span className="cifras">
        {desde}–{hasta} de {total}
      </span>
      {paginas > 1 ? (
        <span className="flex items-center gap-2">
          <Enlace
            href={enlaceDelListado(parametros, {
              pagina: String(pagina - 1),
            })}
            aria-disabled={pagina === 1 ? "true" : undefined}
            aria-label="Página anterior"
            className={boton}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Enlace>
          <span className="cifras">
            {pagina} / {paginas}
          </span>
          <Enlace
            href={enlaceDelListado(parametros, {
              pagina: String(pagina + 1),
            })}
            aria-disabled={pagina === paginas ? "true" : undefined}
            aria-label="Página siguiente"
            className={boton}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Enlace>
        </span>
      ) : null}
    </nav>
  );
}
