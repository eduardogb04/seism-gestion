/**
 * El recorrido de un servicio por etapas (F3-01, ADR 0039), sobre el historial
 * de F0-21: el estado de un servicio es su último evento, no una columna.
 *
 * Cuatro transiciones son **automáticas**: solo las dispara su causa (cargar una
 * cotización, cargar o anular la orden de compra, cobrar todo lo facturado), en la
 * misma transacción. Las demás las pide la persona desde la pantalla. El
 * parámetro `origen` del historial lleva la nota o el motivo del cambio.
 */

import type { Actor } from "../compartido/actor.ts";
import { catalogo } from "../compartido/errores/catalogo.ts";
import {
  definirCiclo,
  type Evento,
  type Historial,
  type Marca,
  type Resultado,
  type Transiciones,
} from "../compartido/historial.ts";
import { diferenciaEnDias, type FechaHora } from "../compartido/reloj.ts";

/** El prefijo del código legible de un servicio: `SRV-2026-014`. */
export const PREFIJO_DE_CODIGO = "SRV";

export const ESTADOS_SERVICIO = [
  "creado",
  "cotizado",
  "adjudicado",
  "en_ejecucion",
  "finalizado",
  "cerrado",
  "perdido",
  "sin_respuesta",
  "cancelado",
] as const;

export type EstadoServicio = (typeof ESTADOS_SERVICIO)[number];

export const ESTADO_INICIAL: EstadoServicio = "creado";

const TRANSICIONES: Transiciones<EstadoServicio> = {
  creado: ["cotizado", "cancelado"],
  cotizado: ["adjudicado", "perdido", "sin_respuesta", "cancelado"],
  adjudicado: ["cotizado", "en_ejecucion", "cancelado"],
  en_ejecucion: ["finalizado", "cancelado"],
  finalizado: ["cerrado"],
  cerrado: [],
  perdido: [],
  // El cliente volvió: está cotizado de nuevo.
  sin_respuesta: ["cotizado"],
  cancelado: [],
};

const CAUSAS = [
  "cotizacion",
  "ordenDeCompra",
  "anulacionDeOrdenDeCompra",
  "cobrado",
] as const;

/** Lo que dispara una transición automática; `cobrado`: lo cobrado alcanzó lo facturado. */
export type Causa = (typeof CAUSAS)[number];

const AUTOMATICAS: Readonly<
  Record<Causa, { readonly de: EstadoServicio; readonly a: EstadoServicio }>
> = {
  cotizacion: { de: "creado", a: "cotizado" },
  ordenDeCompra: { de: "cotizado", a: "adjudicado" },
  // Sin orden vigente no queda adjudicado (F3-03, ADR 0041).
  anulacionDeOrdenDeCompra: { de: "adjudicado", a: "cotizado" },
  cobrado: { de: "finalizado", a: "cerrado" },
};

const PIDEN_MOTIVO: readonly EstadoServicio[] = [
  "perdido",
  "sin_respuesta",
  "cancelado",
];

const CARGAS = [
  "alcance",
  "cotizacion",
  "ordenDeCompra",
  "anulacionDeOrdenDeCompra",
  "factura",
  "cobro",
  "suceso",
  "planificacion",
  "tildarHito",
  "modalidad",
  "cuota",
  "vencimiento",
  "ajuste",
] as const;

/**
 * Lo que se carga en un servicio. Anular sigue la regla de su alta, salvo la orden de compra (ADR 0039).
 * `planificacion` es el responsable, la fecha estimada, los hitos y los recursos (F3-02);
 * `modalidad` elige la de facturación y `cuota` ajusta la cuota mensual (F6-02).
 */
export type Carga = (typeof CARGAS)[number];

const MENOS_CERRADO = ESTADOS_SERVICIO.filter((estado) => estado !== "cerrado");

export const ETAPAS_DE_CARGA: Readonly<
  Record<Carga, readonly EstadoServicio[]>
> = {
  // Los documentos de alcance (F5-01): antes de que haya una orden de compra.
  alcance: ["creado", "cotizado"],
  cotizacion: ["creado", "cotizado"],
  ordenDeCompra: ["cotizado"],
  // Cargarla pasa el servicio a «Adjudicado»: si se anulara solo en «Cotizado», no se anularía nunca.
  anulacionDeOrdenDeCompra: ["adjudicado"],
  factura: ["adjudicado", "en_ejecucion", "finalizado"],
  cobro: MENOS_CERRADO,
  // Las salidas del recorrido (perdido, sin respuesta, cancelado) y «Cerrado» se miran (F5-01).
  suceso: ["creado", "cotizado", "adjudicado", "en_ejecucion", "finalizado"],
  planificacion: ["adjudicado", "en_ejecucion"],
  tildarHito: ["en_ejecucion"],
  // La modalidad de facturación se elige y se cambia solo en «Adjudicado» (F6-02): en «En ejecución» ya está fija.
  modalidad: ["adjudicado"],
  // Ajustar la cuota mensual (F3-03).
  cuota: ["adjudicado", "en_ejecucion"],
  // Corregir la fecha de un vencimiento, cargar uno o descartarlo (F4-02): en «Cerrado» solo se ven.
  vencimiento: ["finalizado"],
  // Las notas de crédito y de débito y la factura adicional (F6-03): alta y anulación.
  ajuste: ["finalizado"],
};

/** Cómo se le factura a un servicio (F3-03, ADR 0041); no es la modalidad del contrato (`Servicio.modalidad`). */
export const MODALIDADES_DE_FACTURACION = [
  "puntual",
  "por_hitos",
  "mensual",
] as const;

export type ModalidadDeFacturacion =
  (typeof MODALIDADES_DE_FACTURACION)[number];

const ETAPAS_DE_FACTURA: Readonly<
  Record<ModalidadDeFacturacion, readonly EstadoServicio[]>
> = {
  // Se factura el trabajo terminado.
  puntual: ["finalizado"],
  por_hitos: ETAPAS_DE_CARGA.factura,
  // La cuota corre con el servicio en marcha.
  mensual: ["en_ejecucion", "finalizado"],
};

export type EventoServicio = Evento<
  EstadoServicio,
  FechaHora,
  Actor,
  string | null
>;

export type HistorialServicio = Historial<
  EstadoServicio,
  FechaHora,
  Actor,
  string | null
>;

type MarcaServicio = Marca<FechaHora, Actor, string | null>;

export const cicloServicio = definirCiclo<
  EstadoServicio,
  FechaHora,
  Actor,
  string | null
>({ transiciones: TRANSICIONES, diferenciaEnDias });

function esAutomatica(de: EstadoServicio, a: EstadoServicio): boolean {
  return Object.values(AUTOMATICAS).some(
    (automatica) => automatica.de === de && automatica.a === a,
  );
}

/** A qué estados puede pasarlo la persona desde `estado`. */
export function transicionesManualesDesde(
  estado: EstadoServicio,
): readonly EstadoServicio[] {
  return TRANSICIONES[estado].filter((a) => !esAutomatica(estado, a));
}

/** Un cambio que la persona no puede pedir: no es manual desde ahí (`DOM-0011`) o le falta el motivo (`DOM-0017`). */
interface CambioRechazado {
  readonly codigo:
    | typeof catalogo.DOM_0011.codigo
    | typeof catalogo.DOM_0017.codigo;
  readonly de: EstadoServicio;
  readonly a: EstadoServicio;
}

/** El cambio que pide la persona; el motivo va en `marca.origen`. */
export function pedirCambio(
  historial: HistorialServicio,
  a: EstadoServicio,
  marca: MarcaServicio,
): Resultado<HistorialServicio, CambioRechazado> {
  const de = cicloServicio.estadoActual(historial);
  if (!transicionesManualesDesde(de).includes(a)) {
    return { ok: false, error: { codigo: catalogo.DOM_0011.codigo, de, a } };
  }
  if (PIDEN_MOTIVO.includes(a) && (marca.origen ?? "").trim() === "") {
    return { ok: false, error: { codigo: catalogo.DOM_0017.codigo, de, a } };
  }
  const agregado = cicloServicio.agregar(historial, a, marca);
  return agregado.ok
    ? agregado
    : { ok: false, error: { codigo: catalogo.DOM_0011.codigo, de, a } };
}

/** El historial con el cambio que dispara `causa`, o `null` si desde el estado actual no mueve nada. */
export function porCausa(
  historial: HistorialServicio,
  causa: Causa,
  marca: MarcaServicio,
): HistorialServicio | null {
  const { de, a } = AUTOMATICAS[causa];
  if (cicloServicio.estadoActual(historial) !== de) {
    return null;
  }
  const agregado = cicloServicio.agregar(historial, a, marca);
  return agregado.ok ? agregado.valor : null;
}

/** Si en `estado` se puede cargar (o anular) `carga`. */
export function admiteCarga(estado: EstadoServicio, carga: Carga): boolean {
  return ETAPAS_DE_CARGA[carga].includes(estado);
}

/** Si en `estado` se carga una factura de un servicio con esa modalidad. */
export function admiteFactura(
  estado: EstadoServicio,
  modalidad: ModalidadDeFacturacion,
): boolean {
  return ETAPAS_DE_FACTURA[modalidad].includes(estado);
}

/** Los días que pasó en cada etapa, en el orden del historial: el último tramo llega hasta `ahora`. */
export function diasPorEtapa(
  historial: HistorialServicio,
  ahora: FechaHora,
): readonly number[] {
  const { eventos } = historial;
  return eventos.map(({ en }, posicion) =>
    diferenciaEnDias(eventos[posicion + 1]?.en ?? ahora, en),
  );
}

/** Un servicio que ya avanzó no se da de baja: se cancela o se cierra. */
export function admiteBaja(estado: EstadoServicio): boolean {
  return estado === ESTADO_INICIAL;
}
