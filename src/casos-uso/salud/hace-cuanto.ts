/**
 * `haceCuanto(ms)` (F0-26): la edad de una corrida o de un fallido en texto
 * corto para el panel de salud. Menos de un minuto, minutos, horas o días
 * (lo que sobra de la unidad se descarta: "hace 3 h", no "hace 3 h 30 min").
 * Una edad negativa (el reloj de la máquina va atrás) se lee como reciente.
 */

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

export function haceCuanto(milisegundos: number): string {
  if (milisegundos < MINUTO) {
    return "hace < 1 min";
  }
  if (milisegundos < HORA) {
    return `hace ${Math.floor(milisegundos / MINUTO)} min`;
  }
  if (milisegundos < DIA) {
    return `hace ${Math.floor(milisegundos / HORA)} h`;
  }
  const dias = Math.floor(milisegundos / DIA);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}
