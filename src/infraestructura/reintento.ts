/**
 * `conReintento(fn, politica)` (F0-25, ADR 0025): corre `fn` y, si falla, la
 * vuelve a intentar con espera creciente. *"Nada falla en silencio."*
 *
 * - **Intentos**: 3 en total por defecto (`politica.intentos`).
 * - **Esperas**: `[1 s, 10 s, 60 s]` por defecto (`politica.esperas`). La
 *   i-ésima espera va antes del intento i+1: con 3 intentos se usan las dos
 *   primeras; con más intentos que esperas, se repite la última.
 * - **La espera se inyecta** (`politica.esperar`, por defecto un
 *   `setTimeout`): así un test no duerme y puede afirmar qué esperas se
 *   pidieron.
 * - **Si agota**: encola el fallo en la `ColaFallidos` (origen, código del
 *   último error, carga, intentos), lo loguea en `error` con `INF-0002` (el
 *   aviso al administrador hasta que exista el puerto de notificaciones,
 *   F0-29) y **relanza** un `ErrorSistema` `INF-0002` con el último error
 *   como causa. Nunca devuelve éxito ni `undefined` después de fallar. Si ni
 *   siquiera se puede encolar, lo dice en el log (`encolado: false`) y relanza
 *   igual.
 */

import { setTimeout as dormir } from "node:timers/promises";
import { catalogo } from "../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../dominio/compartido/errores/error-sistema.ts";
import type { ColaFallidos, ObjetoJson } from "../puertos/cola-fallidos.ts";
import { aErrorSistema, registrarFalla } from "./fallas.ts";
import type { Log } from "./log.ts";

export const INTENTOS_POR_DEFECTO = 3;
export const ESPERAS_POR_DEFECTO: readonly number[] = Object.freeze([
  1000, 10_000, 60_000,
]);

export type PoliticaReintento = {
  /** Quién falla, para la cola y el log (por ejemplo, `ingesta.correo`). */
  readonly origen: string;
  /** Lo necesario para volver a intentarlo si agota. Nunca un secreto. */
  readonly carga: ObjetoJson;
  /** Cuántas veces se intenta en total. Por defecto, 3. */
  readonly intentos?: number;
  /** Milisegundos a esperar antes de cada reintento. */
  readonly esperas?: readonly number[];
  /** Cómo se espera. Por defecto, un `setTimeout`. */
  readonly esperar?: (milisegundos: number) => Promise<void>;
};

export type DependenciasReintento = {
  readonly cola: ColaFallidos;
  readonly log: Log;
};

export type ConReintento = <T>(
  fn: () => Promise<T>,
  politica: PoliticaReintento,
) => Promise<T>;

async function esperarConTimeout(milisegundos: number): Promise<void> {
  await dormir(milisegundos);
}

/** La espera antes del intento `intento + 1` (el primero es 1). */
function esperaAntesDe(esperas: readonly number[], intento: number): number {
  if (esperas.length === 0) {
    return 0;
  }
  return esperas[Math.min(intento - 1, esperas.length - 1)] ?? 0;
}

export function crearConReintento(deps: DependenciasReintento): ConReintento {
  return async <T>(
    fn: () => Promise<T>,
    politica: PoliticaReintento,
  ): Promise<T> => {
    const intentos = Math.max(1, politica.intentos ?? INTENTOS_POR_DEFECTO);
    const esperas = politica.esperas ?? ESPERAS_POR_DEFECTO;
    const esperar = politica.esperar ?? esperarConTimeout;

    let ultimo: unknown;
    for (let intento = 1; intento <= intentos; intento += 1) {
      if (intento > 1) {
        await esperar(esperaAntesDe(esperas, intento - 1));
      }
      try {
        return await fn();
      } catch (causa) {
        ultimo = causa;
      }
    }

    const causa = aErrorSistema(ultimo);
    const agotado = nuevoError(
      catalogo.INF_0002,
      { origen: politica.origen, intentos, codigoCausa: causa.codigo },
      causa,
    );
    const campos = {
      origen: politica.origen,
      intentos,
      codigoCausa: causa.codigo,
    };
    try {
      await deps.cola.encolar({
        origen: politica.origen,
        codigoError: causa.codigo,
        carga: politica.carga,
        intentos,
      });
      registrarFalla(deps.log, agotado, { ...campos, encolado: true });
    } catch (errorAlEncolar) {
      registrarFalla(deps.log, agotado, { ...campos, encolado: false });
      registrarFalla(deps.log, errorAlEncolar, { origen: politica.origen });
    }
    throw agotado;
  };
}
