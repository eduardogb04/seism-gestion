/**
 * Puerto de IA (F0-28, ADR 0026). *"Interfaz propia; nadie más le habla
 * directo."* Ningún módulo le habla a un proveedor de IA fuera de este
 * puerto: el único que lo usa es el caso de uso `interpretar`
 * (`src/casos-uso/ia/interpretar.ts`), que controla el tope de gasto antes de
 * llamar, valida la salida con el esquema Zod de quien pregunta y deja la
 * fila de `uso_ia` antes de devolver.
 *
 * El adaptador **no valida**: devuelve la salida cruda (`ValorJson`). Así
 * ningún adaptador —el doble de hoy, el real de Fase 1— puede saltearse la
 * validación. En Fase 0 hay un solo adaptador, el doble determinista
 * (`src/adaptadores/ia-doble/`); ni una llamada real.
 */
import type { ErrorSistema } from "../dominio/compartido/errores/error-sistema.ts";
import type { MicroUsd } from "../dominio/compartido/micro-usd.ts";

/** Un valor JSON: lo que un proveedor de IA puede devolver y lo que se guarda en `uso_ia.propuesta`. */
export type ValorJson =
  | string
  | number
  | boolean
  | null
  | readonly ValorJson[]
  | { readonly [clave: string]: ValorJson };

/** Lo que se le pregunta al adaptador: con qué perfil y sobre qué texto. */
export type PreguntaIa = {
  /** El perfil (qué se le pide y con qué prompt). Los perfiles reales llegan en Fase 1. */
  readonly perfil: string;
  /** El texto a interpretar. */
  readonly entrada: string;
};

/** Lo que devuelve el adaptador: la salida **sin validar** y lo que costó. */
export type RespuestaIa = {
  readonly salida: ValorJson;
  readonly modelo: string;
  readonly versionPrompt: string;
  /** Lo que costó la llamada, en micro-dólares (ADR 0026). */
  readonly costoMicroUsd: MicroUsd;
  readonly tokens: number;
};

/** El adaptador de IA: el doble en Fase 0, un proveedor real desde Fase 1. */
export type AdaptadorIa = {
  responder(pregunta: PreguntaIa): Promise<RespuestaIa>;
};

/**
 * Por dónde sale el aviso de tope superado (`IA-0001`). Lo arma
 * `src/infraestructura/arranque/avisos.ts` con el puerto `Notificaciones`: un
 * aviso por administrador activo (M-05). **No lanza**: un aviso que falla no
 * tapa el `IA-0001` que lanza `interpretar`; la falla queda en el log.
 */
export type AvisosIa = {
  topeSuperado(error: ErrorSistema): Promise<void>;
};
