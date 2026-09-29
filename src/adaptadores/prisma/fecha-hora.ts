/**
 * De `FechaHora` (fecha civil argentina, sin zona: ADR 0012) al instante que
 * guarda una columna `timestamptz` (F0-28, ADR 0026). La Argentina está en
 * UTC−03:00 todo el año (sin horario de verano desde 2009): las 14:30 civiles
 * son las 17:30 UTC. La conversión vive acá, en el borde, y el dominio no se
 * entera de la zona.
 */
import type { FechaHora } from "../../dominio/compartido/reloj.ts";

/** Horas que hay que sumarle a la hora civil argentina para llegar a UTC. */
const HORAS_HASTA_UTC = 3;

/** El instante que corresponde a una fecha y hora civiles argentinas. */
export function instanteDe(fechaHora: FechaHora): Date {
  const instante = new Date(0);
  // `setUTCFullYear` y no `Date.UTC`: `Date.UTC` lee los años 0–99 como 1900–1999.
  instante.setUTCFullYear(fechaHora.anio, fechaHora.mes - 1, fechaHora.dia);
  instante.setUTCHours(
    fechaHora.hora + HORAS_HASTA_UTC,
    fechaHora.minuto,
    fechaHora.segundo,
    fechaHora.milisegundo,
  );
  return instante;
}
