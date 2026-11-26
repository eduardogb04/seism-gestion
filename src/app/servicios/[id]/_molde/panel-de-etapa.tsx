/**
 * PanelDeEtapa: el molde del panel de cada etapa del servicio (SYSTEM_SPEC
 * §5.3, FRONT_SPEC §6.3). Se arma alrededor de UNA acción principal; prueba de
 * calidad: en 5 segundos se entiende qué es, qué pasa y cuál es el paso que
 * sigue.
 *
 *   <PanelDeEtapa
 *     etapa="cotizado" Icono={Hourglass}
 *     titulo="Esperando respuesta del cliente"   // qué toca, no el nombre de la etapa
 *     bajada="Cotizado hace 5 días."              // una línea, en qué va
 *     metricas={[{ titulo: "Cotización vigente", valor: "ARS 1.000,00", detalle: "v2 · 10/11/2026" }]}
 *     principal={accionPrincipalDe(servicio, ruta)} // `null` si ahora no hay
 *     secundarias={[{ texto: "Nueva versión", href: `${ruta}?cotizacion=1`, Icono: Files }]}
 *   >
 *     <Seccion clave="cotizado.versiones" titulo="Versiones" resumen="3"
 *              parametros={parametros} abreCon={["anular"]}>…</Seccion>
 *   </PanelDeEtapa>
 *
 * - Las acciones van solo si la persona puede actuar en la etapa actual: en
 *   solo lectura se pasa `principal={null}` y `secundarias={[]}`. Las salidas
 *   negativas (perdido, sin respuesta, cancelar) no van acá: están en el «⋯»
 *   del encabezado. La principal sale de `accionPrincipalDe`, la misma que
 *   repite el encabezado fijo.
 * - Cada `Seccion` se pliega y recuerda su estado (cookie `secciones`) por
 *   `clave` («<etapa>.<qué>»). Si una ventana de la sección se abre por la
 *   dirección (`?recurso=1`), poné el parámetro en `abreCon`: una sección
 *   cerrada escondería la ventana.
 * - Todo se adapta al ancho de su columna (`@container/panel`), no al de la
 *   pantalla: dentro usá variantes `@md/panel:`, `@2xl/panel:`.
 * - `ListaDeControl` (lo que falta antes de avanzar) y `MetricaChica` también
 *   se exportan para usarlas sueltas dentro de una sección.
 */

import { CircleCheck, CircleDashed, type LucideIcon } from "lucide-react";
import { cookies } from "next/headers.js";
import type { ReactNode } from "react";
import type { EstadoServicio } from "../../../../dominio/servicios/estados.ts";
import { clasesDeBoton } from "../../../_ui/boton.tsx";
import { cn } from "../../../_ui/cn.ts";
import { Enlace } from "../../../_ui/enlace-next.ts";
import { TEXTO_DE_ETAPA } from "../../../_ui/etapa.tsx";
import type { Accion } from "../../../_ui/panel.tsx";
import type { Parametros } from "../datos-de-panel.ts";
import { COOKIE_DE_SECCIONES, SeccionPlegable } from "./seccion-plegable.tsx";

export type { Accion } from "../../../_ui/panel.tsx";

export type Metrica = {
  readonly titulo: string;
  /** Un importe (`ARS 1.000,00`) se dibuja con la moneda chica delante. */
  readonly valor: ReactNode;
  readonly detalle?: ReactNode;
  readonly Icono?: LucideIcon;
};

const IMPORTE = /^([A-Z]{3}) (-?[\d.,]+)$/;

/** Un importe con la moneda chica y el número tabular; otro texto, tal cual. */
export function Importe({ valor }: { readonly valor: ReactNode }) {
  const partes = typeof valor === "string" ? IMPORTE.exec(valor) : null;
  if (partes === null) {
    return <>{valor}</>;
  }
  return (
    <span className="cifras inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-xs font-medium text-texto-3">{partes[1]}</span>
      {partes[2]}
    </span>
  );
}

export function MetricaChica({ titulo, valor, detalle, Icono }: Metrica) {
  return (
    <article className="flex min-w-0 flex-[1_1_10rem] flex-col bg-superficie px-4 py-3">
      <h3 className="m-0 flex items-center gap-1.5 text-xs font-medium text-texto-2">
        {Icono === undefined ? null : (
          <Icono aria-hidden="true" className="size-3.5 shrink-0" />
        )}
        {titulo}
      </h3>
      <p className="cifras mt-1 mb-0 truncate text-lg leading-7 font-semibold tracking-tight text-texto">
        <Importe valor={valor} />
      </p>
      {detalle === undefined ? null : (
        <p className="mt-0.5 mb-0 truncate text-xs text-texto-3">{detalle}</p>
      )}
    </article>
  );
}

function EnlaceDeAccion({
  accion: { texto, href, Icono, carga },
  variante,
}: {
  readonly accion: Accion;
  readonly variante: "primario" | "fantasma";
}) {
  return (
    <Enlace
      href={href}
      scroll={false}
      className={clasesDeBoton(variante)}
      data-carga={carga}
    >
      {Icono === undefined ? null : <Icono aria-hidden="true" />}
      {texto}
    </Enlace>
  );
}

export type ItemDeControl = {
  readonly texto: string;
  readonly hecho: boolean;
  readonly detalle: string;
  /** Lo que resuelve el pendiente, a la derecha (solo si falta y se puede). */
  readonly accion?: Accion;
};

/** Lo que hace falta antes de avanzar: hecho o pendiente, con ícono y texto (no solo color). */
export function ListaDeControl({
  titulo,
  items,
}: {
  readonly titulo: string;
  readonly items: readonly ItemDeControl[];
}) {
  return (
    <ul
      aria-label={titulo}
      className="overflow-hidden rounded-tarjeta border border-borde"
    >
      {items.map(({ texto, hecho, detalle, accion }) => {
        const Icono = hecho ? CircleCheck : CircleDashed;
        return (
          <li
            key={texto}
            data-control={hecho ? "hecho" : "pendiente"}
            className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-t border-borde px-4 py-2 first:border-t-0"
          >
            <Icono
              aria-hidden="true"
              className={cn(
                "size-[18px] shrink-0",
                hecho ? "text-exito" : "text-texto-3",
              )}
            />
            <span className="sr-only">{hecho ? "Hecho:" : "Pendiente:"}</span>
            <span className={hecho ? "text-texto-2" : "font-medium"}>
              {texto}
            </span>
            <span className="cifras ml-auto text-[13px] text-texto-3">
              {detalle}
            </span>
            {hecho || accion === undefined ? null : (
              <Enlace
                href={accion.href}
                scroll={false}
                data-carga={accion.carga}
                className="text-[13px] font-medium no-underline hover:underline"
              >
                {accion.texto}
              </Enlace>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Lee qué secciones dejó abiertas o cerradas la persona (cookie `secciones`). */
async function estadoGuardado(clave: string): Promise<boolean | null> {
  const valor = (await cookies()).get(COOKIE_DE_SECCIONES)?.value ?? "";
  const par = decodeURIComponent(valor)
    .split(",")
    .find((uno) => uno.startsWith(`${clave}:`));
  return par === undefined ? null : par.endsWith(":1");
}

/**
 * Una sección plegable del panel. `abiertaPorDefecto` (sí, salvo que se diga)
 * vale hasta que la persona la abra o la cierre; un parámetro de `abreCon`
 * presente en la dirección la abre siempre.
 */
export async function Seccion({
  clave,
  titulo,
  resumen,
  extra,
  abiertaPorDefecto = true,
  parametros = {},
  abreCon = [],
  children,
}: {
  readonly clave: string;
  readonly titulo: string;
  /** Al lado del título, chico: «3 versiones», «2 de 5». */
  readonly resumen?: ReactNode;
  /** A la derecha del título: un enlace o botón propio de la sección. */
  readonly extra?: ReactNode;
  readonly abiertaPorDefecto?: boolean;
  readonly parametros?: Parametros;
  readonly abreCon?: readonly string[];
  readonly children: ReactNode;
}) {
  const forzada = abreCon.some(
    (nombre) => typeof parametros[nombre] === "string",
  );
  const guardado = await estadoGuardado(clave);
  return (
    <SeccionPlegable
      clave={clave}
      titulo={titulo}
      resumen={resumen}
      extra={extra}
      abiertaAlEmpezar={forzada || (guardado ?? abiertaPorDefecto)}
    >
      {children}
    </SeccionPlegable>
  );
}

export function PanelDeEtapa({
  etapa,
  Icono,
  titulo,
  bajada,
  metricas = [],
  principal = null,
  secundarias = [],
  children,
}: {
  readonly etapa: EstadoServicio;
  readonly Icono: LucideIcon;
  /** Qué toca hacer: «Preparar la cotización», no «Creado». */
  readonly titulo: string;
  /** Una línea corta: cuánto hace, qué falta. */
  readonly bajada: ReactNode;
  readonly metricas?: readonly Metrica[];
  readonly principal?: Accion | null;
  /** Discretas, al lado de la principal. */
  readonly secundarias?: readonly Accion[];
  /** Las `Seccion` del panel (o contenido suelto). */
  readonly children?: ReactNode;
}) {
  const conAcciones = principal !== null || secundarias.length > 0;
  return (
    <article
      data-panel-de-etapa={etapa}
      className="@container/panel aparece min-w-0 rounded-tarjeta border border-borde bg-superficie shadow-tarjeta"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5 pb-4">
        <div className="flex min-w-0 flex-[1_1_18rem] items-start gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "relative isolate grid size-10 shrink-0 place-items-center overflow-hidden rounded-[10px]",
              TEXTO_DE_ETAPA[etapa],
            )}
          >
            <span className="absolute inset-0 -z-10 bg-current opacity-10" />
            <Icono className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 text-lg leading-7 font-semibold tracking-tight text-balance">
              {titulo}
            </h2>
            <p
              data-contexto-del-panel
              className="mt-0.5 mb-0 text-[13px] text-pretty text-texto-2"
            >
              {bajada}
            </p>
          </div>
        </div>
        {conAcciones ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {principal === null ? null : (
              <EnlaceDeAccion accion={principal} variante="primario" />
            )}
            {secundarias.map((accion) => (
              <EnlaceDeAccion
                key={accion.texto}
                accion={accion}
                variante="fantasma"
              />
            ))}
          </div>
        ) : null}
      </header>
      {metricas.length === 0 ? null : (
        <div className="px-5 pb-5">
          <div
            data-metricas
            className="flex flex-wrap gap-px overflow-hidden rounded-tarjeta border border-borde bg-borde"
          >
            {metricas.map((metrica) => (
              <MetricaChica key={metrica.titulo} {...metrica} />
            ))}
          </div>
        </div>
      )}
      {children === undefined ? null : (
        <div className="border-t border-borde px-5">{children}</div>
      )}
    </article>
  );
}
