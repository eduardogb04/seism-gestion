/** Las acciones que reciben las piezas de hitos y de recursos (F3-02, F6-02): las mismas en todos los paneles. */

import {
  aplicarPlantillaDeHitos,
  cambiarOrdenDeHito,
  cambiarRealizadoDeHito,
  cargarHito,
  cargarRecurso,
  quitarHito,
  quitarRecurso,
} from "../acciones.ts";

export const ACCIONES_DE_HITOS = {
  cargar: cargarHito,
  quitar: quitarHito,
  cambiarRealizado: cambiarRealizadoDeHito,
  cambiarOrden: cambiarOrdenDeHito,
  aplicarPlantilla: aplicarPlantillaDeHitos,
};

export const ACCIONES_DE_RECURSOS = {
  cargar: cargarRecurso,
  quitar: quitarRecurso,
};
