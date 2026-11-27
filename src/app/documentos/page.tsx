/**
 * Documentos: la biblioteca de todo lo que se subió al sistema, de solo
 * lectura. El origen sale de qué registro lo tiene adjunto; cliente y servicio,
 * de ese registro. Lista o cuadrícula (`?vista=cuadricula`). HTML del servidor,
 * sin JavaScript de cliente.
 */

import {
  Download,
  Eye,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  type LucideIcon,
  Search,
} from "lucide-react";
import { armado } from "../../infraestructura/arranque/armado.ts";
import {
  FilaDeFiltros,
  FiltroEnlace,
  Paginas,
  Vacio,
} from "../_plata/piezas.tsx";
import { CLASES_DE_CONTROL } from "../_ui/campo-texto.tsx";
import { cn } from "../_ui/cn.ts";
import { Enlace } from "../_ui/enlace-next.ts";
import { Marco } from "../_ui/marco.tsx";
import { sesionExigida } from "../(auth)/sesion-actual.ts";
import type { PropsListado } from "../catalogo/_abm/paginas.tsx";

const ruta = "/documentos";
const POR_PAGINA = 30;

const ORIGENES = [
  { id: "cotizacion", texto: "Cotizaciones", uno: "Cotización" },
  { id: "orden", texto: "Órdenes de compra", uno: "Orden de compra" },
  { id: "factura", texto: "Facturas", uno: "Factura" },
  { id: "cobro", texto: "Cobros", uno: "Cobro" },
  { id: "egreso", texto: "Egresos", uno: "Egreso" },
  { id: "alcance", texto: "Alcance", uno: "Alcance" },
] as const;
type Origen = (typeof ORIGENES)[number]["id"];

type Vista = {
  buscar: string;
  origen: string;
  cliente: string;
  servicio: string;
  periodo: string;
  cuadricula: boolean;
  pagina: number;
};

function enlaceA(vista: Vista, cambios: Partial<Vista> = {}): string {
  const v = { ...vista, ...cambios };
  const consulta = new URLSearchParams({
    ...(v.buscar === "" ? {} : { buscar: v.buscar }),
    ...(v.origen === "" ? {} : { origen: v.origen }),
    ...(v.cliente === "" ? {} : { cliente: v.cliente }),
    ...(v.servicio === "" ? {} : { servicio: v.servicio }),
    ...(v.periodo === "" ? {} : { periodo: v.periodo }),
    ...(v.cuadricula ? { vista: "cuadricula" } : {}),
    ...(v.pagina > 1 ? { pagina: String(v.pagina) } : {}),
  }).toString();
  return consulta === "" ? ruta : `${ruta}?${consulta}`;
}

const normal = (texto: string) =>
  texto
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

function texto(valor: string | string[] | undefined): string {
  return typeof valor === "string" ? valor.trim() : "";
}

const MES = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
});
const DIA = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function tamanoLegible(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB`;
}

function iconoDe(tipoMime: string): LucideIcon {
  if (tipoMime === "application/pdf") return FileText;
  if (tipoMime.startsWith("image/")) return FileImage;
  if (tipoMime.includes("sheet") || tipoMime.includes("excel")) {
    return FileSpreadsheet;
  }
  return File;
}

type Dueno = {
  servicio: {
    id: string;
    codigo: string;
    cliente: { id: string; razonSocial: string };
  } | null;
  proveedor?: { id: string; razonSocial: string } | null;
};

const CON_SERVICIO = {
  select: {
    servicio: {
      select: {
        id: true,
        codigo: true,
        cliente: { select: { id: true, razonSocial: true } },
      },
    },
  },
} as const;

export default async function Documentos({ searchParams }: PropsListado) {
  const sesion = await sesionExigida();
  const parametros = await searchParams;
  const { email, rol } = sesion.usuario;
  const prisma = armado().prisma;
  const buscar = texto(parametros.buscar);
  const periodo = /^\d{4}-\d{2}$/.test(texto(parametros.periodo))
    ? texto(parametros.periodo)
    : "";

  const [documentos, usuarios] = await Promise.all([
    prisma.documento.findMany({
      where: { eliminadoEn: null },
      select: {
        id: true,
        nombre: true,
        tipoMime: true,
        tamano: true,
        creadoEn: true,
        creadoPor: true,
        cotizaciones: CON_SERVICIO,
        ordenesCompra: CON_SERVICIO,
        facturas: CON_SERVICIO,
        cobros: { select: { factura: CON_SERVICIO } },
        egresos: {
          select: {
            ...CON_SERVICIO.select,
            proveedor: { select: { id: true, razonSocial: true } },
          },
        },
        deServicios: CON_SERVICIO,
      },
      orderBy: { creadoEn: "desc" },
    }),
    prisma.usuario.findMany({
      select: { id: true, nombre: true, email: true },
    }),
  ]);
  const nombres = new Map(
    usuarios.map((u) => [u.id, u.nombre ?? u.email.split("@")[0] ?? u.email]),
  );

  const filas = documentos.map((d) => {
    const candidatos: readonly (readonly [Origen, readonly Dueno[]])[] = [
      ["cotizacion", d.cotizaciones],
      ["orden", d.ordenesCompra],
      ["factura", d.facturas],
      ["cobro", d.cobros.map((c) => c.factura)],
      ["egreso", d.egresos],
      ["alcance", d.deServicios],
    ];
    const [origen, duenos] = candidatos.find(([, l]) => l.length > 0) ?? [
      null,
      [],
    ];
    const dueno = duenos[0];
    const servicio = dueno?.servicio ?? null;
    const cliente = servicio?.cliente ?? dueno?.proveedor ?? null;
    const persona =
      typeof d.creadoPor === "object" &&
      d.creadoPor !== null &&
      "usuarioId" in d.creadoPor
        ? nombres.get(String(d.creadoPor.usuarioId))
        : undefined;
    return {
      id: d.id,
      nombre: d.nombre,
      tipoMime: d.tipoMime,
      tamano: d.tamano,
      mes: MES.format(d.creadoEn),
      fecha: DIA.format(d.creadoEn),
      origen,
      servicio,
      cliente,
      persona: persona ?? "",
    };
  });
  type Fila = (typeof filas)[number];

  const clientes = new Map<string, string>();
  const servicios = new Map<string, string>();
  for (const f of filas) {
    if (f.cliente !== null) clientes.set(f.cliente.id, f.cliente.razonSocial);
    if (f.servicio !== null) servicios.set(f.servicio.id, f.servicio.codigo);
  }
  const ordenado = (m: Map<string, string>) =>
    [...m].sort((a, b) => a[1].localeCompare(b[1], "es"));

  const origenPedido = ORIGENES.some((o) => o.id === parametros.origen)
    ? texto(parametros.origen)
    : "";
  const vista: Vista = {
    buscar,
    origen: origenPedido,
    cliente: texto(parametros.cliente),
    servicio: texto(parametros.servicio),
    periodo,
    cuadricula: parametros.vista === "cuadricula",
    pagina: 1,
  };
  const buscado = normal(buscar);
  const filtradas = filas.filter(
    (f) =>
      (vista.origen === "" || f.origen === vista.origen) &&
      (vista.cliente === "" || f.cliente?.id === vista.cliente) &&
      (vista.servicio === "" || f.servicio?.id === vista.servicio) &&
      (periodo === "" || f.mes === periodo) &&
      (buscado === "" || normal(f.nombre).includes(buscado)),
  );
  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pagina = Math.min(
    Math.max(1, Number.parseInt(texto(parametros.pagina), 10) || 1),
    paginas,
  );
  const visibles = filtradas.slice(
    (pagina - 1) * POR_PAGINA,
    pagina * POR_PAGINA,
  );
  const conPagina = { ...vista, pagina };
  const nombreDeOrigen = (o: Origen | null) =>
    ORIGENES.find((x) => x.id === o)?.uno ?? "Sin origen";

  const botonDeIcono =
    "presionable grid size-8 place-items-center rounded-md text-texto-2 no-underline hover:bg-superficie-3 hover:text-texto";
  const acciones = (f: Fila) => (
    <span className="relative z-10 flex shrink-0 justify-end gap-0.5">
      <a
        href={`/documentos/${f.id}?ver=1`}
        target="_blank"
        rel="noreferrer"
        aria-label="Ver"
        title="Ver"
        className={botonDeIcono}
      >
        <Eye aria-hidden="true" className="size-4" />
      </a>
      <a
        href={`/documentos/${f.id}`}
        aria-label="Descargar"
        title="Descargar"
        className={botonDeIcono}
      >
        <Download aria-hidden="true" className="size-4" />
      </a>
    </span>
  );

  const subtitulo = (f: Fila) => (
    <span className="flex min-w-0 flex-wrap gap-x-1 text-[12px] text-texto-3">
      <span>{nombreDeOrigen(f.origen)}</span>
      {f.servicio === null ? null : (
        <>
          <span aria-hidden="true">·</span>
          <Enlace
            href={`/servicios/${f.servicio.id}`}
            className="cifras text-texto-3 no-underline hover:text-texto hover:underline"
          >
            {f.servicio.codigo}
          </Enlace>
        </>
      )}
      {f.cliente === null ? null : (
        <>
          <span aria-hidden="true">·</span>
          <span className="truncate">{f.cliente.razonSocial}</span>
        </>
      )}
    </span>
  );

  const botonDeVista = (cuadricula: boolean, nombre: string) => (
    <Enlace
      href={enlaceA(vista, { cuadricula })}
      aria-current={vista.cuadricula === cuadricula ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center rounded px-3 text-sm font-medium no-underline pointer-coarse:h-10",
        vista.cuadricula === cuadricula
          ? "bg-superficie text-texto shadow-tarjeta"
          : "text-texto-2 hover:text-texto",
      )}
    >
      {nombre}
    </Enlace>
  );

  return (
    <Marco email={email} rol={rol} rutaActual={ruta}>
      <main className="flex flex-col gap-5">
        <header className="aparece flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-[24px] leading-8 font-semibold tracking-tight">
              Documentos
            </h1>
            <p className="m-0 mt-1 text-texto-2">
              Todo lo que se subió al sistema: cotizaciones, órdenes de compra,
              facturas, cobros, egresos y alcances.
            </p>
          </div>
          <nav
            aria-label="Vista"
            className="flex rounded-control border border-borde bg-superficie-2 p-0.5"
          >
            {botonDeVista(false, "Lista")}
            {botonDeVista(true, "Cuadrícula")}
          </nav>
        </header>

        <form action={ruta} className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <label htmlFor="buscar-documento" className="sr-only">
              Buscar documento
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-texto-3"
            />
            <input
              id="buscar-documento"
              type="search"
              name="buscar"
              defaultValue={buscar}
              placeholder="Buscar por nombre…"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              className={cn(CLASES_DE_CONTROL, "pl-9")}
            />
          </div>
          <label className="sr-only" htmlFor="filtro-cliente">
            Cliente
          </label>
          <select
            id="filtro-cliente"
            name="cliente"
            defaultValue={vista.cliente}
            className={cn(CLASES_DE_CONTROL, "sm:w-48")}
          >
            <option value="">Todos los clientes</option>
            {ordenado(clientes).map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filtro-servicio">
            Servicio
          </label>
          <select
            id="filtro-servicio"
            name="servicio"
            defaultValue={vista.servicio}
            className={cn(CLASES_DE_CONTROL, "sm:w-44")}
          >
            <option value="">Todos los servicios</option>
            {ordenado(servicios).map(([id, codigo]) => (
              <option key={id} value={id}>
                {codigo}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filtro-periodo">
            Período
          </label>
          <input
            id="filtro-periodo"
            type="month"
            name="periodo"
            defaultValue={periodo}
            className={cn(CLASES_DE_CONTROL, "sm:w-40")}
          />
          {vista.origen === "" ? null : (
            <input type="hidden" name="origen" value={vista.origen} />
          )}
          {vista.cuadricula ? (
            <input type="hidden" name="vista" value="cuadricula" />
          ) : null}
          <button
            type="submit"
            className="presionable h-9 rounded-control border border-borde-fuerte bg-superficie px-3 text-sm font-medium text-texto shadow-tarjeta hover:bg-superficie-2 pointer-coarse:h-11"
          >
            Filtrar
          </button>
        </form>
        <FilaDeFiltros>
          <FiltroEnlace
            href={enlaceA(vista, { origen: "" })}
            activo={vista.origen === ""}
          >
            Todos
          </FiltroEnlace>
          {ORIGENES.map((o) => (
            <FiltroEnlace
              key={o.id}
              href={enlaceA(vista, { origen: o.id })}
              activo={vista.origen === o.id}
            >
              {o.texto}
            </FiltroEnlace>
          ))}
        </FilaDeFiltros>

        {visibles.length === 0 ? (
          <Vacio titulo="No hay documentos con esos filtros." />
        ) : (
          <>
            {vista.cuadricula ? (
              <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 p-0">
                {visibles.map((f) => {
                  const Icono = iconoDe(f.tipoMime);
                  return (
                    <li
                      key={f.id}
                      className="relative flex flex-col overflow-hidden rounded-tarjeta border border-borde bg-superficie shadow-tarjeta"
                    >
                      <a
                        href={`/documentos/${f.id}?ver=1`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Ver ${f.nombre}`}
                        className="grid h-32 place-items-center overflow-hidden bg-superficie-2 text-texto-3"
                      >
                        {f.tipoMime.startsWith("image/") ? (
                          // biome-ignore lint/performance/noImgElement: archivo servido por la ruta protegida, sin optimizador
                          <img
                            src={`/documentos/${f.id}?ver=1`}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : (
                          <Icono
                            aria-hidden="true"
                            className="size-12"
                            strokeWidth={1.25}
                          />
                        )}
                      </a>
                      <div className="flex min-w-0 flex-col gap-0.5 p-3">
                        <span
                          className="truncate text-[13px] font-medium"
                          title={f.nombre}
                        >
                          {f.nombre}
                        </span>
                        {subtitulo(f)}
                        <span className="cifras mt-1 text-[12px] text-texto-3">
                          {tamanoLegible(f.tamano)} · {f.fecha}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="m-0 flex list-none flex-col overflow-hidden rounded-tarjeta border border-borde bg-superficie p-0 shadow-tarjeta">
                {visibles.map((f) => {
                  const Icono = iconoDe(f.tipoMime);
                  return (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 border-b border-borde px-4 py-2.5 last:border-b-0 hover:bg-superficie-2"
                    >
                      <Icono
                        aria-hidden="true"
                        className="size-5 shrink-0 text-texto-3"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span
                          className="truncate text-sm font-medium"
                          title={f.nombre}
                        >
                          {f.nombre}
                        </span>
                        {subtitulo(f)}
                        <span className="cifras truncate text-[12px] text-texto-3 md:hidden">
                          {[tamanoLegible(f.tamano), f.fecha, f.persona]
                            .filter((t) => t !== "")
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="cifras hidden w-20 shrink-0 text-right text-[13px] text-texto-2 md:block">
                        {tamanoLegible(f.tamano)}
                      </span>
                      <span className="cifras hidden w-24 shrink-0 text-[13px] text-texto-2 md:block">
                        {f.fecha}
                      </span>
                      <span
                        className="hidden w-32 shrink-0 truncate text-[13px] text-texto-2 lg:block"
                        title={f.persona}
                      >
                        {f.persona}
                      </span>
                      {acciones(f)}
                    </li>
                  );
                })}
              </ul>
            )}
            <Paginas
              texto={`Página ${pagina} de ${paginas} · ${filtradas.length} en total`}
              anterior={
                pagina > 1 ? enlaceA(conPagina, { pagina: pagina - 1 }) : null
              }
              siguiente={
                pagina < paginas
                  ? enlaceA(conPagina, { pagina: pagina + 1 })
                  : null
              }
            />
          </>
        )}
      </main>
    </Marco>
  );
}
