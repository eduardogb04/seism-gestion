/**
 * El servicio por etapa (F3-06; F6-01, ADR 0048): la línea de etapas del
 * encabezado, el color de cada estado y, para los paneles de «Adjudicado» en
 * adelante y las salidas, las secciones que se dibujan en cada uno.
 */

import { Check } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { ETIQUETAS_DE_ESTADO } from "../../../casos-uso/servicios/formulario.ts";
import type { DetalleDePlanificacion } from "../../../casos-uso/servicios/planificacion.ts";
import type { DetalleDeServicio } from "../../../casos-uso/servicios/servicios.ts";
import type { EstadoServicio } from "../../../dominio/servicios/estados.ts";
import { Enlace } from "../../_ui/enlace-next.ts";
import { AjustesDelServicio } from "../_piezas/ajustes.tsx";
import { Avance } from "./avance.tsx";
import { Cotizaciones } from "./cotizaciones.tsx";
import { Egresos } from "./egresos.tsx";
import { Facturacion } from "./facturacion.tsx";
import { Facturas } from "./facturas.tsx";
import { Hitos } from "./hitos.tsx";
import { OrdenesDeCompra } from "./ordenes-de-compra.tsx";
import { Recursos } from "./recursos.tsx";
import { rutaDeEtapa } from "./rutas.ts";
import { Vencimientos } from "./vencimientos.tsx";

type Parametros = Readonly<Record<string, string | string[] | undefined>>;

const ETAPAS: readonly EstadoServicio[] = [
  "creado",
  "cotizado",
  "adjudicado",
  "en_ejecucion",
  "finalizado",
  "cerrado",
];

/** El color del estado: neutro al empezar, aviso mientras espera algo, acento en obra, éxito al cerrar, peligro en las salidas. */
const COLORES: Record<EstadoServicio, string> = {
  creado: "border-borde-control bg-superficie-alta text-texto",
  cotizado: "border-aviso bg-aviso-suave text-aviso",
  adjudicado: "border-acento bg-superficie-alta text-acento",
  en_ejecucion: "border-acento bg-superficie-alta text-acento",
  finalizado: "border-aviso bg-aviso-suave text-aviso",
  cerrado: "border-exito bg-exito-suave text-exito",
  perdido: "border-peligro bg-peligro-suave text-peligro",
  sin_respuesta: "border-peligro bg-peligro-suave text-peligro",
  cancelado: "border-peligro bg-peligro-suave text-peligro",
};

export function ChipDeEstado({
  servicio: { etapa, estado },
}: {
  readonly servicio: DetalleDeServicio;
}) {
  return (
    <span
      data-estado-del-servicio
      data-color={etapa}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold whitespace-nowrap ${COLORES[etapa]}`}
    >
      {estado}
    </span>
  );
}

/** Las recorridas con tilde y enlace a su panel (en solo lectura), la actual resaltada, las futuras apagadas. */
export function LineaDeEtapas({
  servicio: { id, etapa, recorridas },
}: {
  readonly servicio: DetalleDeServicio;
}) {
  const lista = ETAPAS.includes(etapa) ? ETAPAS : [...ETAPAS, etapa];
  return (
    <nav aria-label="Etapas" className="mt-5">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(6rem,1fr))]">
        {lista.map((valor) => {
          const situacion =
            valor === etapa
              ? "actual"
              : recorridas.includes(valor)
                ? "recorrida"
                : "futura";
          const etiqueta = ETIQUETAS_DE_ESTADO[valor];
          return (
            <li
              key={valor}
              data-etapa={valor}
              data-situacion={situacion}
              aria-current={situacion === "actual" ? "step" : undefined}
              className={`border-t-4 pt-2 text-sm ${
                situacion === "actual"
                  ? "border-acento font-semibold text-acento"
                  : situacion === "recorrida"
                    ? "border-exito"
                    : "border-borde text-texto-suave"
              }`}
            >
              {situacion === "futura" ? (
                etiqueta
              ) : (
                <Enlace
                  href={rutaDeEtapa(id, valor)}
                  className="inline-flex items-center gap-1 no-underline hover:underline pointer-coarse:min-h-11"
                >
                  {situacion === "recorrida" ? (
                    <Check aria-hidden="true" className="size-4 text-exito" />
                  ) : null}
                  {etiqueta}
                </Enlace>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type Datos = {
  readonly servicio: DetalleDeServicio;
  readonly detalle: DetalleDePlanificacion;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly puedeRenovar: boolean;
  readonly parametros: Parametros;
  readonly etapa: EtapaConSecciones;
};

/** «Creado» y «Cotizado» tienen su panel propio (F6-01); el resto, hasta F6-04, las secciones de siempre. */
export type EtapaConSecciones = Exclude<EstadoServicio, "creado" | "cotizado">;

const propias = ({ servicio, ruta, puedeEscribir, parametros }: Datos) => ({
  servicioId: servicio.id,
  ruta,
  puedeEscribir,
  parametros,
});

const SECCIONES = {
  cotizaciones: ({ servicio, ruta }: Datos): ReactNode => (
    <Cotizaciones servicioId={servicio.id} ruta={ruta} />
  ),
  // Se carga en el panel de «Cotizado»; en «Adjudicado» queda para mirarla y anularla.
  ordenes: (datos: Datos): ReactNode => <OrdenesDeCompra {...propias(datos)} />,
  facturacion: (datos: Datos): ReactNode => <Facturacion {...propias(datos)} />,
  hitos: (datos: Datos): ReactNode => (
    <Hitos {...propias(datos)} detalle={datos.detalle} />
  ),
  recursos: (datos: Datos): ReactNode => (
    <Recursos {...propias(datos)} detalle={datos.detalle} />
  ),
  facturas: (datos: Datos): ReactNode => <Facturas {...propias(datos)} />,
  ajustes: (datos: Datos): ReactNode => (
    <AjustesDelServicio {...propias(datos)} />
  ),
  avance: ({ servicio }: Datos): ReactNode => (
    <Avance servicioId={servicio.id} />
  ),
  egresos: ({ servicio }: Datos): ReactNode => (
    <Egresos servicioId={servicio.id} />
  ),
  // Antes de «Finalizado» solo hay el de renovar el contrato: sin él no se dibuja.
  vencimientos: (datos: Datos): ReactNode => (
    <Vencimientos
      {...propias(datos)}
      puedeRenovar={datos.puedeRenovar}
      sinFilasNoSeDibuja={
        datos.etapa === "adjudicado" || datos.etapa === "en_ejecucion"
      }
    />
  ),
};

const VISTAS: Readonly<
  Record<EtapaConSecciones, readonly (keyof typeof SECCIONES)[]>
> = {
  adjudicado: [
    "ordenes",
    "facturacion",
    "hitos",
    "recursos",
    "facturas",
    "avance",
    "vencimientos",
  ],
  en_ejecucion: [
    "facturacion",
    "hitos",
    "recursos",
    "facturas",
    "avance",
    "egresos",
    "vencimientos",
  ],
  finalizado: [
    "facturacion",
    "facturas",
    "ajustes",
    "avance",
    "egresos",
    "vencimientos",
  ],
  cerrado: ["facturacion", "facturas", "avance", "egresos", "vencimientos"],
  // Salidas del recorrido: se miran, como «Cerrado».
  perdido: ["cotizaciones"],
  sin_respuesta: ["cotizaciones"],
  cancelado: ["cotizaciones"],
};

/** Las etapas donde no se carga ni se cambia nada: el servicio se mira. */
export function esSoloLectura(etapa: EstadoServicio): boolean {
  return (
    etapa === "cerrado" ||
    etapa === "perdido" ||
    etapa === "sin_respuesta" ||
    etapa === "cancelado"
  );
}

export function VistaDeEtapa(datos: Datos) {
  return VISTAS[datos.etapa].map((nombre) => (
    <Fragment key={nombre}>{SECCIONES[nombre](datos)}</Fragment>
  ));
}
