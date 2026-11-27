/**
 * Plantillas de recursos (R3, SYSTEM_SPEC §7.1): una lista de recursos que se
 * copia a un servicio, sola al crearlo si la plantilla es del tipo, o a mano.
 * Sin tipo de servicio es genérica. Cada recurso se escribe en una línea
 * (`tipo | descripción | cantidad`), sin camiones: son de cada cliente.
 */

import { z } from "zod";
import { errorDeLineaDeRecurso } from "../../dominio/servicios/recurso-de-plantilla.ts";
import type { DefinicionAbm } from "./definicion.ts";
import { obligatorio } from "./validaciones.ts";

export const PLANTILLAS_DE_RECURSOS: DefinicionAbm<"PlantillaRecursos"> = {
  entidad: "PlantillaRecursos",
  singular: "plantilla de recursos",
  plural: "Plantillas de recursos",
  ruta: "/catalogo/plantillas-de-recursos",
  campos: {
    nombre: { tipo: "texto", etiqueta: "Nombre" },
    tipoServicioId: {
      tipo: "relacion",
      etiqueta: "Tipo de servicio (sin tipo: genérica)",
      entidad: "TipoServicio",
      mostrar: "nombre",
    },
    recursos: {
      tipo: "lista",
      etiqueta: "Recursos",
      elemento: "recurso",
      editor: "recursos",
    },
  },
  validacion: z.object({
    nombre: obligatorio("el nombre", 80),
    tipoServicioId: z.string().nullable(),
    recursos: z
      .array(
        z.string().superRefine((linea, contexto) => {
          const error = errorDeLineaDeRecurso(linea);
          if (error !== undefined) {
            contexto.addIssue({ code: "custom", message: error });
          }
        }),
      )
      .min(1, "Agregá al menos un recurso."),
  }),
  unicos: ["nombre"],
  busqueda: ["nombre"],
  orden: ["nombre"],
  rolesQueEscriben: ["administrador", "operador"],
  listado: [
    "nombre",
    "tipoServicioId",
    { etiqueta: "Recursos", de: ({ recursos }) => String(recursos.length) },
  ],
};
