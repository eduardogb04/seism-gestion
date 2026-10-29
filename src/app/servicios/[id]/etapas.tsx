/**
 * El servicio por etapa (F3-06): la línea de etapas y, debajo, solo las
 * secciones de la etapa que se mira. Las secciones son las de siempre; acá se
 * decide cuáles van en cada etapa.
 */

import { Fragment, type ReactNode } from "react";
import { ETIQUETAS_DE_ESTADO } from "../../../casos-uso/servicios/formulario.ts";
import type { DetalleDePlanificacion } from "../../../casos-uso/servicios/planificacion.ts";
import type { DetalleDeServicio } from "../../../casos-uso/servicios/servicios.ts";
import type { EstadoServicio } from "../../../dominio/servicios/estados.ts";
import { Enlace } from "../../_ui/enlace-next.ts";
import { AjustesDelServicio } from "../_piezas/ajustes.tsx";
import { Avance } from "./avance.tsx";
import { Cotizaciones } from "./cotizaciones.tsx";
import { DocumentosDeAlcance } from "./documentos-de-alcance.tsx";
import { Egresos } from "./egresos.tsx";
import { Facturacion } from "./facturacion.tsx";
import { Facturas } from "./facturas.tsx";
import { Hitos } from "./hitos.tsx";
import { OrdenesDeCompra } from "./ordenes-de-compra.tsx";
import { Recursos } from "./recursos.tsx";
import { Sitios } from "./sitios.tsx";
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

/** La etapa que pide `?etapa=` si es una que el servicio ya recorrió y no es la actual; si no, `null`. */
export function etapaPasada(
  { etapa, recorridas }: DetalleDeServicio,
  pedida: string | string[] | undefined,
): EstadoServicio | null {
  return (
    recorridas.find(
      (recorrida) => recorrida === pedida && recorrida !== etapa,
    ) ?? null
  );
}

export function LineaDeEtapas({
  servicio: { etapa, recorridas },
  ruta,
}: {
  readonly servicio: DetalleDeServicio;
  readonly ruta: string;
}) {
  const lista = ETAPAS.includes(etapa) ? ETAPAS : [...ETAPAS, etapa];
  return (
    <nav aria-label="Etapas" className="mt-4">
      <ol className="flex flex-wrap gap-x-4 gap-y-1">
        {lista.map((valor) => {
          const situacion =
            valor === etapa
              ? "actual"
              : recorridas.includes(valor)
                ? "recorrida"
                : "futura";
          return (
            <li
              key={valor}
              data-etapa={valor}
              data-situacion={situacion}
              aria-current={situacion === "actual" ? "step" : undefined}
              className={
                situacion === "actual"
                  ? "font-semibold"
                  : situacion === "futura"
                    ? "text-texto-suave"
                    : undefined
              }
            >
              {situacion === "recorrida" ? (
                <Enlace href={`${ruta}?etapa=${valor}`}>
                  {ETIQUETAS_DE_ESTADO[valor]}
                </Enlace>
              ) : (
                ETIQUETAS_DE_ESTADO[valor]
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
  readonly etapa: EstadoServicio;
};

const propias = ({ servicio, ruta, puedeEscribir, parametros }: Datos) => ({
  servicioId: servicio.id,
  ruta,
  puedeEscribir,
  parametros,
});

const SECCIONES = {
  sitios: ({ servicio, puedeEscribir }: Datos): ReactNode => (
    <Sitios servicio={servicio} puedeEscribir={puedeEscribir} />
  ),
  alcance: (datos: Datos): ReactNode => (
    <DocumentosDeAlcance {...propias(datos)} />
  ),
  cotizaciones: (datos: Datos): ReactNode => (
    <Cotizaciones {...propias(datos)} />
  ),
  // Se carga en «Cotizado»; en «Adjudicado» queda para mirarla y anularla.
  ordenes: (datos: Datos): ReactNode => (
    <OrdenesDeCompra
      {...propias(datos)}
      puedeCargar={datos.etapa === "cotizado"}
    />
  ),
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
  Record<EstadoServicio, readonly (keyof typeof SECCIONES)[]>
> = {
  creado: ["sitios", "alcance", "cotizaciones"],
  cotizado: ["alcance", "cotizaciones", "ordenes"],
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
  // En «Creado» no se cargan recursos, pero los camiones de una renovación llegan copiados: se ven.
  const secciones =
    datos.etapa === "creado" && datos.detalle.recursos.length > 0
      ? [...VISTAS.creado, "recursos" as const]
      : VISTAS[datos.etapa];
  return secciones.map((nombre) => (
    <Fragment key={nombre}>{SECCIONES[nombre](datos)}</Fragment>
  ));
}
