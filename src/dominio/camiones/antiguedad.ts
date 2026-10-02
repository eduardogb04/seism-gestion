import type { FechaHora } from "../compartido/reloj.ts";

/**
 * Años del camión según el año de hoy: la antigüedad de la cisterna si la
 * tiene y, si no, la de la unidad. Un año de fabricación futuro cuenta 0.
 */
export function antiguedadEnAnios(
  hoy: FechaHora,
  anioTractor: number,
  anioCisterna: number | null,
): number {
  return Math.max(0, hoy.anio - (anioCisterna ?? anioTractor));
}
