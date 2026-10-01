/** Grupos (F1-03): el primer ABM del molde. Nombre único y observaciones. */

import { z } from "zod";
import type { DefinicionAbm } from "./definicion.ts";

export const GRUPOS: DefinicionAbm<"Grupo"> = {
  entidad: "Grupo",
  singular: "grupo",
  plural: "Grupos",
  ruta: "/catalogo/grupos",
  campos: {
    nombre: { tipo: "texto", etiqueta: "Nombre" },
    observaciones: { tipo: "textoLargo", etiqueta: "Observaciones" },
  },
  validacion: z.object({
    nombre: z
      .string()
      .trim()
      .min(1, "Escribí el nombre.")
      .max(80, "El nombre no puede pasar de 80 caracteres."),
    observaciones: z
      .string()
      .trim()
      .max(1000, "Las observaciones no pueden pasar de 1000 caracteres.")
      .nullable(),
  }),
  unicos: ["nombre"],
  busqueda: ["nombre", "observaciones"],
  orden: ["nombre"],
  rolesQueEscriben: ["administrador", "operador"],
  listado: ["nombre", "observaciones"],
};
