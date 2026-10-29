/**
 * Cómo se guarda una plantilla de hitos (F6-02, ADR 0049): la fila de
 * `plantillas_hitos` y, en `plantillas_hitos_items`, sus hitos con el lugar de
 * cada uno. Para el resto del molde la plantilla es una sola fila con
 * `hitos: string[]`: se lee con sus ítems incluidos y, al guardar, los ítems de
 * antes se reemplazan por los nuevos en la misma escritura.
 */

import type { DatosAbm } from "../../../puertos/repositorios/abm.ts";
import type {
  PlantillaHitos as FilaPlantilla,
  Prisma,
} from "../generado/client.ts";
import { type Conversion, enColumna, type TablaAbm } from "./repositorio.ts";

type FilaConItems = FilaPlantilla & {
  items: { orden: number; texto: string }[];
};

const ITEMS = {
  select: { orden: true, texto: true },
  orderBy: { orden: "asc" },
} as const;

export const CONVERSION_PLANTILLA: Conversion<
  FilaConItems,
  DatosAbm<"PlantillaHitos">
> = {
  aDatos: ({ items, ...resto }) => ({
    ...resto,
    hitos: items.map(({ texto }) => texto),
  }),
  aFila: ({ hitos, ...resto }) => ({
    ...resto,
    items: hitos.map((texto, posicion) => ({ orden: posicion + 1, texto })),
  }),
  texto: (columna) => columna,
  marcada: (columna) => columna,
  dia: () => undefined,
  ordenPor: (columna, sentido) => enColumna(columna, sentido),
};

/** La tabla de plantillas vista con sus ítems: lo que lee los trae y lo que escribe los reemplaza. */
export function tablaDePlantillas(
  tabla: Prisma.TransactionClient["plantillaHitos"],
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
