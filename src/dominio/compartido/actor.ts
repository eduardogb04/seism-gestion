/**
 * `Actor` (F0-22, DISENO): *"todo registro guarda su origen: persona,
 * ingesta de mail o propuesta de IA, y si un humano la confirmó"*. `Actor`
 * es la parte de "quién": un actor humano identificado, o un proceso del
 * sistema con nombre. **No existe actor anónimo**: no hay un tercer caso ni
 * un `Actor` sin `tipo`, lo verifica el compilador
 * (`tests/dominio/actor.test.ts`, `@ts-expect-error`). Todo caso de uso que
 * escribe recibe un `Actor` obligatorio.
 */

import type { Resultado } from "./historial.ts";
import type { Identificador } from "./identificador.ts";

/** Quién hizo algo: una persona identificada, o un proceso del sistema. */
export type Actor =
  | { readonly tipo: "persona"; readonly usuarioId: Identificador<"Usuario"> }
  | { readonly tipo: "sistema"; readonly proceso: NombreProceso };

declare const marcaNombreProceso: unique symbol;

/**
 * El nombre de un proceso del sistema (`recordatorio-vencimientos`,
 * `ingesta-mail`...): no vacío, en kebab-case. Solo lo produce
 * `crearNombreProceso`.
 */
export type NombreProceso = string & {
  readonly [marcaNombreProceso]: true;
};

const PATRON_NOMBRE_PROCESO = /^[a-z][a-z0-9-]*$/;

/**
 * Arma un `NombreProceso` validando la forma, o dice por qué no puede. Pura:
 * no decide qué nombres existen, solo que la forma sea la que el resto del
 * dominio puede confiar sin volver a validar.
 */
export function crearNombreProceso(
  valor: string,
): Resultado<NombreProceso, string> {
  if (!PATRON_NOMBRE_PROCESO.test(valor)) {
    return {
      ok: false,
      error: `nombre de proceso inválido: "${valor}" (tiene que ser no vacío, en kebab-case: empezar con una letra minúscula y seguir con letras, números o guiones).`,
    };
  }
  return { ok: true, valor: valor as NombreProceso };
}
