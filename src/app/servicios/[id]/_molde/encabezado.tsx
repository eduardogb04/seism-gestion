/**
 * El encabezado del servicio, igual en todas las etapas (FRONT_SPEC §6.3):
 * «← Servicios»; la barra fija al desplazar con el código, el título, la etapa,
 * la acción principal y el menú «⋯»; y debajo cliente · sitios · contratación ·
 * responsable. `DatosDelServicio` es la tarjeta con el resto de los datos, que
 * va arriba de la actividad.
 */

import {
  ArrowLeft,
  Building2,
  CalendarRange,
  HardHat,
  MapPin,
  RefreshCcw,
} from "lucide-react";
import type { DetalleDeServicio } from "../../../../casos-uso/servicios/servicios.ts";
import { clasesDeBoton } from "../../../_ui/boton.tsx";
import { Enlace } from "../../../_ui/enlace-next.ts";
import { ChipDeEtapa } from "../../../_ui/etapa.tsx";
import type { Accion } from "../../../_ui/panel.tsx";
import { SALIDAS_NEGATIVAS } from "./accion-principal.ts";
import { MenuDelServicio, type OpcionDelMenu } from "./menu-del-servicio.tsx";
import { Persona } from "./persona.tsx";

const LISTADO = "/servicios";

function datoDe(servicio: DetalleDeServicio, etiqueta: string): string {
  return servicio.datos.find(([de]) => de === etiqueta)?.[1] ?? "";
}

export function EncabezadoDelServicio({
  servicio,
  rutaActual,
  principal,
  puedeEscribir,
  puedeActuar,
}: {
  readonly servicio: DetalleDeServicio;
  /** El panel de la etapa actual: ahí se abren las ventanas del menú. */
  readonly rutaActual: string;
  readonly principal: Accion | null;
  /** Editar y dar de baja (no en Cerrado ni en las salidas). */
  readonly puedeEscribir: boolean;
  /** Las salidas y la acción principal (cualquier rol que escribe, en la etapa actual). */
  readonly puedeActuar: boolean;
}) {
  const sitios = servicio.sitios
    .filter(({ marcado }) => marcado)
    .map(({ nombre }) => nombre);
  const contratacion = datoDe(servicio, "Contratación");
  const vigencia = datoDe(servicio, "Vigencia");
  const salidas: OpcionDelMenu[] = puedeActuar
    ? servicio.transiciones
        .filter(({ valor }) =>
          SALIDAS_NEGATIVAS.some((negativa) => negativa === valor),
        )
        .map(({ valor, etiqueta }) => ({
          texto: etiqueta,
          href: `${rutaActual}?pasar=${valor}`,
          peligro: valor === "cancelado",
        }))
    : [];
  const edicion: OpcionDelMenu[] = puedeEscribir
    ? [{ texto: "Editar", href: `${rutaActual}?editar=1` }]
    : [];
  const baja: OpcionDelMenu[] =
    puedeEscribir && servicio.admiteBaja
      ? [{ texto: "Dar de baja", href: `${rutaActual}?baja=1`, peligro: true }]
      : [];
  return (
    <>
      <p className="m-0 mb-1">
        <Enlace
          href={LISTADO}
          className="presionable -ml-1.5 inline-flex items-center gap-1 rounded-control px-1.5 py-1 text-[13px] text-texto-3 no-underline hover:bg-superficie-2 hover:text-texto pointer-coarse:min-h-11"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          Servicios
        </Enlace>
      </p>
      <header className="encabezado-fijo -mx-4 md:-mx-8">
        <div className="encabezado-fijo__barra border-b border-transparent bg-fondo/85 px-4 py-2.5 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="m-0 flex items-center gap-2">
                <span className="font-mono text-xs text-texto-3">
                  {servicio.codigo}
                </span>
                <span data-estado-del-servicio data-color={servicio.etapa}>
                  <ChipDeEtapa etapa={servicio.etapa} llena />
                </span>
              </p>
              <h1 className="m-0 mt-0.5 truncate text-xl leading-7 font-semibold tracking-tight">
                {servicio.titulo}
              </h1>
            </div>
            {puedeActuar && principal !== null ? (
              <Enlace
                href={principal.href}
                scroll={false}
                data-accion-del-encabezado
                className={clasesDeBoton(
                  "primario",
                  "encabezado-fijo__accion max-sm:px-2.5",
                )}
              >
                {principal.Icono === undefined ? null : (
                  <principal.Icono aria-hidden="true" />
                )}
                <span className="max-sm:sr-only">{principal.texto}</span>
              </Enlace>
            ) : null}
            <MenuDelServicio grupos={[edicion, salidas, baja]} />
          </div>
        </div>
      </header>
      <ul className="m-0 mt-1.5 flex list-none flex-wrap items-center gap-x-4 gap-y-1.5 p-0 text-[13px] text-texto-2">
        <li className="inline-flex min-w-0 items-center gap-1.5">
          <Building2 aria-hidden="true" className="size-3.5 text-texto-3" />
          <span className="sr-only">Cliente:</span>
          {datoDe(servicio, "Cliente")}
        </li>
        <li
          className="inline-flex min-w-0 items-center gap-1.5"
          title={sitios.join(" · ") || undefined}
        >
          <MapPin aria-hidden="true" className="size-3.5 text-texto-3" />
          <span className="sr-only">Sitios:</span>
          {sitios.length === 0
            ? "Sin sitios"
            : sitios.length <= 2
              ? sitios.join(" · ")
              : `${sitios.length} sitios`}
        </li>
        {servicio.diaDeObra === null ? null : (
          <li className="inline-flex min-w-0 items-center gap-1.5">
            <HardHat aria-hidden="true" className="size-3.5 text-texto-3" />
            En obra · día {servicio.diaDeObra}
            <span className="text-xs text-texto-3">
              desde el {servicio.inicioReal}
            </span>
          </li>
        )}
        {contratacion === "" ? null : (
          <li className="inline-flex min-w-0 items-center gap-1.5">
            <CalendarRange
              aria-hidden="true"
              className="size-3.5 text-texto-3"
            />
            <span className="sr-only">Contratación:</span>
            {contratacion}
            {vigencia === "" ? null : (
              <span className="cifras text-texto-3">· {vigencia}</span>
            )}
          </li>
        )}
        <li className="inline-flex min-w-0 items-center gap-1.5">
          <span className="sr-only">Responsable:</span>
          <Persona quien={datoDe(servicio, "Responsable")} chica />
        </li>
        {servicio.renueva === null ? null : (
          <li data-renueva className="inline-flex items-center gap-1.5">
            <RefreshCcw aria-hidden="true" className="size-3.5 text-texto-3" />
            Renueva{" "}
            <Enlace
              href={`${LISTADO}/${servicio.renueva.id}`}
              className="font-mono text-xs"
            >
              {servicio.renueva.codigo}
            </Enlace>
          </li>
        )}
      </ul>
    </>
  );
}

/** Lo que no entra en la línea de arriba del encabezado. */
const YA_EN_EL_ENCABEZADO = [
  "Cliente",
  "Responsable",
  "Contratación",
  "Vigencia",
];

export function DatosDelServicio({
  servicio,
  facturacion,
}: {
  readonly servicio: DetalleDeServicio;
  /** La modalidad de facturación elegida; `null` si todavía no se eligió. */
  readonly facturacion: string | null;
}) {
  const datos = [
    ...servicio.datos.filter(
      ([etiqueta]) => !YA_EN_EL_ENCABEZADO.includes(etiqueta),
    ),
    ["Facturación", facturacion ?? "Sin definir"] as const,
  ];
  return (
    <section
      aria-labelledby="titulo-de-datos"
      className="rounded-tarjeta border border-borde bg-superficie px-4 pt-3.5 pb-3 shadow-tarjeta"
    >
      <h2 id="titulo-de-datos" className="m-0 mb-2 text-[15px] font-semibold">
        Datos
      </h2>
      <dl
        data-datos-del-servicio
        className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]"
      >
        {datos.map(([etiqueta, texto]) => (
          <div key={etiqueta} className="contents">
            <dt className="text-texto-3">{etiqueta}</dt>
            <dd
              className={`m-0 whitespace-pre-line break-words ${
                texto === "Sin definir" ? "text-texto-3" : ""
              }`}
            >
              {texto}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
