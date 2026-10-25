/**
 * Cuándo vence un trabajo terminado (F4-01, ADR 0043): la única función que
 * decide la fecha. La regla es la del tipo de servicio; el camión, si el
 * trabajo tuvo uno.
 */

import { antiguedadEnAnios } from "../camiones/antiguedad.ts";
import { type FechaHora, sumarMeses } from "../compartido/reloj.ts";

/** Los plazos de un tipo de servicio, con los nombres de sus campos: el tipo entero la cumple. */
export interface ReglaDeVencimiento {
  readonly vencimientoMeses: number | null;
  /** Rige solo junto con `antiguedadCorteAnios`: el CHECK de la base no deja uno sin el otro. */
  readonly vencimientoMesesAntiguos: number | null;
  readonly antiguedadCorteAnios: number | null;
}

export interface AniosDelCamion {
  readonly anioTractor: number;
  readonly anioCisterna: number | null;
}

/**
 * La fecha de vencimiento, o `null` si no vence. Solo cuenta el día de la
 * finalización, y a esa fecha se mide la antigüedad del camión: con más años
 * que el corte, el plazo de antiguos; con los mismos o menos, o sin camión, el
 * común.
 */
export function fechaDeVencimiento(
  finalizacion: FechaHora,
  regla: ReglaDeVencimiento,
  camion: AniosDelCamion | null,
): FechaHora | null {
  const { vencimientoMesesAntiguos: antiguos, antiguedadCorteAnios: corte } =
    regla;
  const esAntiguo =
    camion !== null &&
    corte !== null &&
    antiguedadEnAnios(finalizacion, camion.anioTractor, camion.anioCisterna) >
      corte;
  const meses =
    esAntiguo && antiguos !== null ? antiguos : regla.vencimientoMeses;
  return meses === null ? null : sumarMeses(finalizacion, meses);
}
