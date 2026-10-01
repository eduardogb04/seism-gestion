/**
 * Las definiciones de todos los ABM, por entidad (F1-03, ADR 0031). Un ABM
 * nuevo suma su línea. Las acciones de los formularios reciben el **nombre**
 * de la entidad (una definición no viaja al navegador: lleva su validación) y
 * la buscan acá.
 */

import { z } from "zod";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type { EntidadAbm } from "../../puertos/repositorios/abm.ts";
import type { DefinicionAbm } from "./definicion.ts";
import { GRUPOS } from "./grupos.ts";

export const DEFINICIONES: { readonly [E in EntidadAbm]: DefinicionAbm<E> } = {
  Grupo: GRUPOS,
};

const esquemaEntidad = z
  .string()
  .refine((nombre): nombre is EntidadAbm =>
    Object.hasOwn(DEFINICIONES, nombre),
  );

function aplicar<E extends EntidadAbm, T>(
  entidad: E,
  trabajo: (definicion: DefinicionAbm<E>) => T,
): T {
  return trabajo(DEFINICIONES[entidad]);
}

/**
 * Corre `trabajo` con la definición de `entidad`. El nombre llega atado a una
 * acción de formulario, o sea de afuera: si no es el de un ABM, `DOM-0009`.
 */
export function conDefinicion<T>(
  entidad: unknown,
  trabajo: <E extends EntidadAbm>(definicion: DefinicionAbm<E>) => T,
): T {
  const leida = esquemaEntidad.safeParse(entidad);
  if (!leida.success) {
    throw nuevoError(catalogo.DOM_0009, { entidad });
  }
  return aplicar(leida.data, trabajo);
}
