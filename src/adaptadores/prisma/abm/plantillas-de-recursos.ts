/**
 * Cómo se guarda una plantilla de recursos (R3): la fila de
 * `plantillas_recursos` y, en `plantillas_recursos_items`, sus recursos con el
 * lugar de cada uno. Igual que la de hitos: para el molde es una sola fila con
 * `recursos: string[]` (una línea por recurso) y los ítems se reemplazan
 * enteros al guardar.
 */

import {
  lineaDeRecurso,
  recursoDeLinea,
} from "../../../dominio/servicios/recurso-de-plantilla.ts";
import type { DatosAbm } from "../../../puertos/repositorios/abm.ts";
import type {
  PlantillaRecursos as FilaPlantilla,
  Prisma,
} from "../generado/client.ts";
import { type Conversion, enColumna, type TablaAbm } from "./repositorio.ts";

type FilaConItems = FilaPlantilla & {
  items: {
    orden: number;
    tipo: string;
    descripcion: string;
    cantidad: string | null;
  }[];
};

const ITEMS = {
  select: { orden: true, tipo: true, descripcion: true, cantidad: true },
  orderBy: { orden: "asc" },
} as const;

export const CONVERSION_PLANTILLA_DE_RECURSOS: Conversion<
  FilaConItems,
  DatosAbm<"PlantillaRecursos">
> = {
  aDatos: ({ items, ...resto }) => ({
    ...resto,
    recursos: items.map(({ tipo, descripcion, cantidad }) =>
      lineaDeRecurso({ tipo, descripcion, cantidad }),
    ),
  }),
  aFila: ({ recursos, ...resto }) => ({
    ...resto,
    items: recursos.flatMap((linea, posicion) => {
      const recurso = recursoDeLinea(linea);
      return recurso === null ? [] : [{ orden: posicion + 1, ...recurso }];
    }),
  }),
  texto: (columna) => columna,
  marcada: (columna) => columna,
  dia: () => undefined,
  ordenPor: (columna, sentido) => enColumna(columna, sentido),
};

/** La tabla de plantillas vista con sus ítems: lo que lee los trae y lo que escribe los reemplaza. */
export function tablaDePlantillasDeRecursos(
  tabla: Prisma.TransactionClient["plantillaRecursos"],
): TablaAbm<FilaConItems> {
  return {
    findMany: (args) => tabla.findMany({ ...args, include: { items: ITEMS } }),
    count: (args) => tabla.count(args),
    findFirst: (args) =>
      tabla.findFirst({ ...args, include: { items: ITEMS } }),
    findUnique: (args) =>
      tabla.findUnique({ ...args, include: { items: ITEMS } }),
    create: ({ data: { items, ...fila } }) =>
      tabla.create({ data: { ...fila, items: { create: items } } }),
    update: ({ where, data: { items, ...fila } }) =>
      tabla.update({
        where,
        data: { ...fila, items: { deleteMany: {}, create: items } },
      }),
  };
}
