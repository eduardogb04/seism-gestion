/**
 * Un recurso de una plantilla de recursos (R3) escrito en una línea:
 * `tipo | descripción | cantidad`, con la cantidad solo para un material. Es
 * como lo escribe el formulario del ABM y como lo lee el repositorio.
 */

export const TIPOS_DE_RECURSO_DE_PLANTILLA = [
  "persona",
  "equipo",
  "material",
] as const;

export type RecursoDePlantilla = {
  readonly tipo: string;
  readonly descripcion: string;
  readonly cantidad: string | null;
};

/** La línea de un recurso. */
export function lineaDeRecurso({
  tipo,
  descripcion,
  cantidad,
}: RecursoDePlantilla): string {
  return [tipo, descripcion, ...(cantidad === null ? [] : [cantidad])].join(
    " | ",
  );
}

/** El recurso de una línea, sin validarlo (`null` si no tiene ni tipo ni descripción). */
export function recursoDeLinea(linea: string): RecursoDePlantilla | null {
  const [tipo = "", descripcion = "", ...resto] = linea
    .split("|")
    .map((parte) => parte.trim());
  const cantidad = resto.join(" | ");
  return tipo === "" || descripcion === ""
    ? null
    : { tipo, descripcion, cantidad: cantidad === "" ? null : cantidad };
}

/** Lo que la persona tiene que corregir en una línea, si algo. */
export function errorDeLineaDeRecurso(linea: string): string | undefined {
  const recurso = recursoDeLinea(linea);
  if (recurso === null) {
    return "Escribí «tipo | descripción», por ejemplo «persona | Operario».";
  }
  if (!TIPOS_DE_RECURSO_DE_PLANTILLA.some((tipo) => tipo === recurso.tipo)) {
    return "El tipo es persona, equipo o material.";
  }
  if (recurso.descripcion.length > 200) {
    return "La descripción no puede pasar de 200 caracteres.";
  }
  if (recurso.cantidad !== null && recurso.tipo !== "material") {
    return "Solo un material lleva cantidad: «material | descripción | cantidad».";
  }
  return undefined;
}
