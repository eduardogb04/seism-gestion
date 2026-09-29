/**
 * Doble determinista del puerto de IA (F0-28, ADR 0026). Sirve para dominio,
 * casos de uso y e2e: responde **solo** lo que dice la tabla de casos que
 * recibe al construirse, buscando por perfil y entrada exactos. Una pregunta
 * que no está en la tabla es un error explícito (`INF-0001` con el perfil en
 * los detalles), nunca una respuesta inventada. Misma pregunta, misma
 * respuesta: no guarda estado entre llamadas salvo el contador.
 *
 * `llamadas()` no es del puerto: es un agregado del doble para que un test
 * afirme cuántas veces se le preguntó (por ejemplo, cero cuando el tope de
 * gasto frenó la llamada).
 */
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type { AdaptadorIa, PreguntaIa, RespuestaIa } from "../../puertos/ia.ts";

/** Una fila de la tabla: para esta pregunta, esta respuesta. */
export type CasoIaDoble = PreguntaIa & {
  readonly respuesta: RespuestaIa;
};

/** Clave de búsqueda: el perfil y la entrada, sin ambigüedad (un arreglo JSON). */
function clave({ perfil, entrada }: PreguntaIa): string {
  return JSON.stringify([perfil, entrada]);
}

/** Un `AdaptadorIa` que responde según `casos`, con `llamadas()` para inspección. */
export function crearIaDoble(casos: readonly CasoIaDoble[]): AdaptadorIa & {
  /** Cuántas veces se llamó a `responder`, estuviera o no en la tabla. */
  llamadas(): number;
} {
  const tabla = new Map<string, RespuestaIa>();
  for (const { perfil, entrada, respuesta } of casos) {
    const k = clave({ perfil, entrada });
    if (tabla.has(k)) {
      throw nuevoError(catalogo.INF_0001, {
        motivo:
          "la tabla del doble de IA tiene dos casos para la misma pregunta",
        perfil,
      });
    }
    tabla.set(k, structuredClone(respuesta));
  }
  let llamadas = 0;

  return {
    responder(pregunta) {
      llamadas += 1;
      const respuesta = tabla.get(clave(pregunta));
      if (respuesta === undefined) {
        return Promise.reject(
          nuevoError(catalogo.INF_0001, {
            motivo: "el doble de IA no tiene un caso para esta pregunta",
            perfil: pregunta.perfil,
          }),
        );
      }
      return Promise.resolve(structuredClone(respuesta));
    },
    llamadas() {
      return llamadas;
    },
  };
}
