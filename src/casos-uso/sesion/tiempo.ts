/**
 * Las dos cuentas de tiempo que necesita la sesión (F0-31) y que el reloj del
 * dominio no trae (tiene días, meses y años): sumar segundos a una
 * `FechaHora` (el vencimiento de 12 horas) y medir milisegundos entre dos (la
 * caché de 30 s). Se arman con lo que el dominio sí exporta —`sumarDias`,
 * `diferenciaEnDias`, `crearFechaHora`—, sin `Date`: la hora sale siempre del
 * reloj inyectado.
 */

import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import {
  crearFechaHora,
  diferenciaEnDias,
  type FechaHora,
  sumarDias,
} from "../../dominio/compartido/reloj.ts";

const MS_POR_SEGUNDO = 1000;
const MS_POR_MINUTO = 60 * MS_POR_SEGUNDO;
const MS_POR_HORA = 60 * MS_POR_MINUTO;
const MS_POR_DIA = 24 * MS_POR_HORA;

function milisegundosDelDia(fechaHora: FechaHora): number {
  return (
    fechaHora.hora * MS_POR_HORA +
    fechaHora.minuto * MS_POR_MINUTO +
    fechaHora.segundo * MS_POR_SEGUNDO +
    fechaHora.milisegundo
  );
}

/** Milisegundos de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function milisegundosEntre(desde: FechaHora, hasta: FechaHora): number {
  return (
    diferenciaEnDias(hasta, desde) * MS_POR_DIA +
    milisegundosDelDia(hasta) -
    milisegundosDelDia(desde)
  );
}

/** `fechaHora` más `segundos` (enteros; negativo resta). */
export function sumarSegundos(
  fechaHora: FechaHora,
  segundos: number,
): FechaHora {
  const total = milisegundosDelDia(fechaHora) + segundos * MS_POR_SEGUNDO;
  const dias = Math.floor(total / MS_POR_DIA);
  const resto = total - dias * MS_POR_DIA;
  const dia = sumarDias(fechaHora, dias);
  const resultado = crearFechaHora({
    anio: dia.anio,
    mes: dia.mes,
    dia: dia.dia,
    hora: Math.floor(resto / MS_POR_HORA),
    minuto: Math.floor((resto % MS_POR_HORA) / MS_POR_MINUTO),
    segundo: Math.floor((resto % MS_POR_MINUTO) / MS_POR_SEGUNDO),
    milisegundo: resto % MS_POR_SEGUNDO,
  });
  if (!resultado.ok) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "sumar segundos dio una fecha inválida",
      mensaje: resultado.mensaje,
    });
  }
  return resultado.fechaHora;
}
