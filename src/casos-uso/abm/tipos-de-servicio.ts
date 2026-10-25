/** Tipos de servicio (F1-07): la vertical de cada servicio; de esta lista eligen los servicios. */

import { z } from "zod";
import type { DefinicionAbm, OpcionAbm } from "./definicion.ts";

/** Las modalidades de un servicio: la del tipo es la que trae por defecto. */
export const MODALIDADES: readonly OpcionAbm[] = [
  { valor: "puntual", etiqueta: "Puntual" },
  { valor: "recurrente", etiqueta: "Recurrente" },
];

// Los topes dejan afuera lo que no entra en la columna entera de la base.
const meses = z
  .number()
  .int()
  .gt(0, "Tiene que ser un número entero mayor que 0.")
  .max(1200, "No puede pasar de 1200 meses (100 años).")
  .nullable();

const anios = z
  .number()
  .int()
  .gt(0, "Tiene que ser un número entero mayor que 0.")
  .max(100, "No puede pasar de 100 años.")
  .nullable();

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
    // La regla de vencimiento (F4-01, ADR 0043).
    vencimientoMeses: {
      tipo: "numero",
      etiqueta: "Plazo de vencimiento (meses)",
      decimales: 0,
      opcional: true,
    },
    vencimientoMesesAntiguos: {
      tipo: "numero",
      etiqueta: "Plazo para camiones antiguos (meses)",
      decimales: 0,
      opcional: true,
    },
    antiguedadCorteAnios: {
      tipo: "numero",
      etiqueta: "Antigüedad de corte (años)",
      decimales: 0,
      opcional: true,
    },
    activo: { tipo: "siNo", etiqueta: "Activo", marcadaAlCrear: true },
  },
  validacion: z
    .object({
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
      vencimientoMeses: meses,
      vencimientoMesesAntiguos: meses,
      antiguedadCorteAnios: anios,
      activo: z.boolean(),
    })
    .superRefine((tipo, contexto) => {
      if (
        tipo.vencimientoMesesAntiguos !== null &&
        tipo.antiguedadCorteAnios === null
      ) {
        contexto.addIssue({
          code: "custom",
          path: ["antiguedadCorteAnios"],
          message:
            "Escribí la antigüedad de corte: va junto con el plazo para camiones antiguos.",
        });
      }
      if (
        tipo.antiguedadCorteAnios !== null &&
        tipo.vencimientoMesesAntiguos === null
      ) {
        contexto.addIssue({
          code: "custom",
          path: ["vencimientoMesesAntiguos"],
          message:
            "Escribí el plazo para camiones antiguos: va junto con la antigüedad de corte.",
        });
      }
    }),
  unicos: ["nombre"],
  busqueda: ["nombre"],
  orden: ["nombre"],
  rolesQueEscriben: ["administrador", "operador"],
  listado: ["nombre", "modalidad", "activo"],
};
