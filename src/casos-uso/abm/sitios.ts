/**
 * Sitios (F1-05): donde está la instalación de un cliente. Los tanques no son
 * entidades: el sitio lleva la cantidad y la capacidad total, y cómo cambian
 * se muestra en la edición, leído de `auditoria`.
 */

import { z } from "zod";
import type { DefinicionAbm } from "./definicion.ts";
import { PROVINCIAS } from "./provincias.ts";
import { obligatorio, opcional } from "./validaciones.ts";

function coordenada(maximo: number, mensaje: string) {
  return z.number().min(-maximo, mensaje).max(maximo, mensaje).nullable();
}

const cantidad = z.number().min(0, "No puede ser negativo.");

export const SITIOS: DefinicionAbm<"Sitio"> = {
  entidad: "Sitio",
  singular: "sitio",
  plural: "Sitios",
  ruta: "/catalogo/sitios",
  campos: {
    clienteId: {
      tipo: "relacion",
      etiqueta: "Cliente",
      entidad: "Cliente",
      mostrar: "razonSocial",
      obligatoria: true,
    },
    nombre: { tipo: "texto", etiqueta: "Nombre" },
    provincia: { tipo: "opcion", etiqueta: "Provincia", opciones: PROVINCIAS },
    localidad: { tipo: "texto", etiqueta: "Localidad" },
    direccion: { tipo: "texto", etiqueta: "Dirección", opcional: true },
    latitud: {
      tipo: "numero",
      etiqueta: "Latitud",
      decimales: 6,
      opcional: true,
    },
    longitud: {
      tipo: "numero",
      etiqueta: "Longitud",
      decimales: 6,
      opcional: true,
    },
    cantidadTanques: {
      tipo: "numero",
      etiqueta: "Cantidad de tanques",
      decimales: 0,
    },
    capacidadTotalLitros: {
      tipo: "numero",
      etiqueta: "Capacidad total (litros)",
      decimales: 0,
    },
    observaciones: { tipo: "textoLargo", etiqueta: "Observaciones" },
  },
  validacion: z
    .object({
      clienteId: z.string("Elegí un cliente."),
      nombre: obligatorio("el nombre", 120),
      provincia: z.string(),
      localidad: obligatorio("la localidad", 80),
      direccion: opcional(120),
      latitud: coordenada(90, "La latitud va de -90 a 90."),
      longitud: coordenada(180, "La longitud va de -180 a 180."),
      cantidadTanques: cantidad,
      capacidadTotalLitros: cantidad,
      observaciones: opcional(1000),
    })
    .refine(
      ({ latitud, longitud }) => (latitud === null) === (longitud === null),
      {
        path: ["latitud"],
        message: "Cargá la latitud y la longitud, o ninguna.",
      },
    ),
  unicos: [
    {
      columnas: ["clienteId", "nombre"],
      mensaje: "Ya hay un sitio con ese nombre para este cliente.",
    },
  ],
  busqueda: ["nombre", "localidad"],
  orden: ["nombre", "localidad"],
  rolesQueEscriben: ["administrador", "operador"],
  listado: [
    "nombre",
    "clienteId",
    "provincia",
    "localidad",
    "cantidadTanques",
    "capacidadTotalLitros",
  ],
  historial: ["cantidadTanques", "capacidadTotalLitros"],
};
