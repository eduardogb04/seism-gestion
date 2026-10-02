/** Centros de costo (F2-01): a cada egreso se le imputa uno; su clase decide a qué rentabilidad cuenta. */

import { z } from "zod";
import type { DefinicionAbm } from "./definicion.ts";

export const CENTROS_DE_COSTO: DefinicionAbm<"CentroCosto"> = {
  entidad: "CentroCosto",
  singular: "centro de costo",
  plural: "Centros de costo",
  ruta: "/catalogo/centros-de-costo",
  campos: {
    nombre: { tipo: "texto", etiqueta: "Nombre" },
    clase: {
      tipo: "opcion",
      etiqueta: "Clase",
      opciones: [
        { valor: "proyecto", etiqueta: "Proyecto" },
        {
          valor: "gestion_administrativa",
          etiqueta: "Gestión administrativa",
        },
        { valor: "fuera_de_rentabilidad", etiqueta: "Fuera de rentabilidad" },
      ],
    },
    descripcion: { tipo: "textoLargo", etiqueta: "Descripción" },
    activo: { tipo: "siNo", etiqueta: "Activo", marcadaAlCrear: true },
  },
  validacion: z.object({
    nombre: z
      .string()
      .trim()
      .min(1, "Escribí el nombre.")
      .max(80, "El nombre no puede pasar de 80 caracteres."),
    clase: z.string(),
    descripcion: z
      .string()
      .trim()
      .max(1000, "La descripción no puede pasar de 1000 caracteres.")
      .nullable(),
    activo: z.boolean(),
  }),
  unicos: ["nombre"],
  busqueda: ["nombre"],
  orden: ["nombre"],
  rolesQueEscriben: ["administrador", "operador"],
  listado: ["nombre", "clase", "activo"],
};
