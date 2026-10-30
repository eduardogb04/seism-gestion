/**
 * Plantillas de hitos (F6-02, ADR 0049): una lista de hitos que se copia a un
 * servicio. Sin tipo de servicio es genérica. La lista se edita en el mismo
 * formulario y se guarda en una tabla hija, que el repositorio reemplaza entera.
 */

import { z } from "zod";
import type { DefinicionAbm } from "./definicion.ts";
import { obligatorio } from "./validaciones.ts";

export const PLANTILLAS_DE_HITOS: DefinicionAbm<"PlantillaHitos"> = {
  entidad: "PlantillaHitos",
  singular: "plantilla de hitos",
  plural: "Plantillas de hitos",
  ruta: "/catalogo/plantillas-de-hitos",
  campos: {
    nombre: { tipo: "texto", etiqueta: "Nombre" },
    tipoServicioId: {
      tipo: "relacion",
      etiqueta: "Tipo de servicio (sin tipo: genérica)",
      entidad: "TipoServicio",
      mostrar: "nombre",
    },
    hitos: { tipo: "lista", etiqueta: "Hitos", elemento: "hito" },
  },
  validacion: z.object({
    nombre: obligatorio("el nombre", 80),
    tipoServicioId: z.string().nullable(),
    hitos: z
      .array(obligatorio("el hito", 200))
      .min(1, "Agregá al menos un hito."),
  }),
  unicos: ["nombre"],
  busqueda: ["nombre"],
  orden: ["nombre"],
  rolesQueEscriben: ["administrador", "operador"],
  listado: [
    "nombre",
    "tipoServicioId",
    { etiqueta: "Hitos", de: ({ hitos }) => String(hitos.length) },
  ],
};
