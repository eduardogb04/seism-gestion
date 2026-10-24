/**
 * El nombre de un mes en castellano (F2-10, F3-03): lo usan el tablero y la
 * facturación mensual, también en el navegador, así que no trae nada de servidor.
 */

const NOMBRES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** `octubre de 2026`. */
export const nombreDelMes = ({
  anio,
  mes,
}: {
  readonly anio: number;
  readonly mes: number;
}): string => `${NOMBRES[mes - 1]} de ${anio}`;
