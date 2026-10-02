/** Tipos de servicio (F1-07): la vertical de cada servicio; de esta lista eligen los servicios. */

import { z } from "zod";
import type { DefinicionAbm, OpcionAbm } from "./definicion.ts";

/** Las modalidades de un servicio: la del tipo es la que trae por defecto. */
export const MODALIDADES: readonly OpcionAbm[] = [
  { valor: "puntual", etiqueta: "Puntual" },
  { valor: "recurrente", etiqueta: "Recurrente" },
];

export const TIPOS_DE_SERVICIO: DefinicionAbm<"TipoServicio"> = {
  entidad: "TipoServicio",
  singular: "tipo de servicio",
  plural: "Tipos de servicio",
  ruta: "/catalogo/tipos-de-servicio",
  campos: {
    nombre: { tipo: "texto", etiqueta: "Nombre" },
    descripcion: { tipo: "textoLargo", etiqueta: "Descripción" },
    modalidad: {
      tipo: "opcion",
      etiqueta: "Modalidad por defecto",
      opciones: MODALIDADES,
    },
    activo: { tipo: "siNo", etiqueta: "Activo", marcadaAlCrear: true },
  },
  validacion: z.object({
    nombre: z
      .string()
      .trim()
      .min(1, "Escribí el nombre.")
      .max(80, "El nombre no puede pasar de 80 caracteres."),
    descripcion: z
      .string()
      .trim()
      .max(1000, "La descripción no puede pasar de 1000 caracteres.")
      .nullable(),
    modalidad: z.string(),
    activo: z.boolean(),
  }),
  unicos: ["nombre"],
  busqueda: ["nombre"],
  orden: ["nombre"],
  rolesQueEscriben: ["administrador", "operador"],
  listado: ["nombre", "modalidad", "activo"],
};
