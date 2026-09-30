/**
 * Lo que comparten `interpretar` y `gastoDelMes` (F0-28, R6): el mes civil
 * del reloj inyectado y los montos de `configuracion`.
 *
 * - Claves: `ia.tope_mensual_usd` (el tope del mes) e
 *   `ia.costo_estimado_usd.<perfil>` (lo que se estima que cuesta una
 *   llamada con ese perfil; si falta, `ia.costo_estimado_usd.defecto`). El
 *   doble no puede estimar antes de llamar: el costo fijo por perfil lo
 *   reemplaza el adaptador real de Fase 1.
 * - Los valores son texto decimal con punto (`"20.00"`, `"0.015"`) que se
 *   leen a micro-dólares con `parsearUsd`. Una clave que falta o que no se
 *   puede leer es `INF-0001` con la clave en los detalles: el sistema está
 *   mal configurado, no es algo que resuelva quien usa.
 */
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import {
  type MicroUsd,
  parsearUsd,
} from "../../dominio/compartido/micro-usd.ts";
import {
  crearFechaHora,
  type FechaHora,
  sumarMeses,
} from "../../dominio/compartido/reloj.ts";
import type { LectorConfiguracion } from "../../puertos/repositorios/configuracion.ts";

const CLAVE_TOPE = "ia.tope_mensual_usd";
const PREFIJO_COSTO_ESTIMADO = "ia.costo_estimado_usd.";
const PERFIL_POR_DEFECTO = "defecto";

/** Un mes civil: su etiqueta (`2026-09`) y sus límites `[desde, hasta)`. */
export type MesCivil = {
  readonly etiqueta: string;
  readonly desde: FechaHora;
  readonly hasta: FechaHora;
};

/** El mes civil al que pertenece `ahora` (la fecha del reloj inyectado, nunca `Date`). */
export function mesDe(ahora: FechaHora): MesCivil {
  const inicio = crearFechaHora({
    anio: ahora.anio,
    mes: ahora.mes,
    dia: 1,
    hora: 0,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!inicio.ok) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "no se pudo armar el primer día del mes",
      mensaje: inicio.mensaje,
    });
  }
  const anio = String(ahora.anio).padStart(4, "0");
  const mes = String(ahora.mes).padStart(2, "0");
  return {
    etiqueta: `${anio}-${mes}`,
    desde: inicio.fechaHora,
    hasta: sumarMeses(inicio.fechaHora, 1),
  };
}

/** El tope mensual de gasto de IA, en micro-dólares. */
export async function leerTope(
  configuracion: LectorConfiguracion,
): Promise<MicroUsd> {
  return leerUsd(CLAVE_TOPE, await configuracion.leer(CLAVE_TOPE));
}

/** El costo estimado de una llamada con `perfil`, o el de `defecto` si el perfil no tiene uno. */
export async function leerCostoEstimado(
  configuracion: LectorConfiguracion,
  perfil: string,
): Promise<MicroUsd> {
  const clavePerfil = `${PREFIJO_COSTO_ESTIMADO}${perfil}`;
  const delPerfil = await configuracion.leer(clavePerfil);
  if (delPerfil !== null) {
    return leerUsd(clavePerfil, delPerfil);
  }
  const claveDefecto = `${PREFIJO_COSTO_ESTIMADO}${PERFIL_POR_DEFECTO}`;
  return leerUsd(claveDefecto, await configuracion.leer(claveDefecto));
}

function leerUsd(clave: string, valor: string | null): MicroUsd {
  if (valor === null) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "falta una clave de configuración de IA",
      clave,
    });
  }
  const leido = parsearUsd(valor);
  if (!leido.ok) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "una clave de configuración de IA no es un monto en dólares",
      clave,
      problema: leido.error.motivo,
    });
  }
  return leido.valor;
}
