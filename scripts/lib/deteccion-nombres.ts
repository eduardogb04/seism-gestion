/**
 * Motor de detección de `npm run nombres-prohibidos` (repo público: sin
 * nombres reales de clientes, proyectos ni personas — ver AGENTS.md, sección
 * *Nombres prohibidos*). Este módulo nunca ve un término en claro: recibe
 * `hash` (SHA-256 de la frase normalizada) y `palabras` (cuántas palabras
 * tiene) desde `scripts/lib/nombres-prohibidos-datos.ts`, y compara *hashes*
 * contra *hashes* — jamás una lista en claro contra el texto del archivo.
 *
 * Normalización: minúsculas y sin diacríticos (`NFD` + se borran las marcas
 * combinantes, así "Gómez" y "gomez" caen en la misma forma). Tokeniza en
 * letras, números y guion bajo (`[a-z0-9_]+`): un identificador con guion
 * bajo (`Proyecto_Ejemplo`) queda como una sola palabra a propósito, no dos.
 *
 * Comparación por línea: cada línea se tokeniza por separado y se arman
 * *n-gramas* de `palabras` palabras consecutivas dentro de esa misma línea
 * (uno por cada término de esa longitud), se hashea cada n-grama con el
 * mismo algoritmo y se lo busca en el conjunto de hashes esperado.
 * Limitación conocida y aceptada: un término de varias palabras partido a
 * mano entre dos líneas no se detecta; a cambio, no hay falsos positivos por
 * unir el final de una oración con el principio de la siguiente.
 */

import { createHash } from "node:crypto";

export interface TerminoProhibido {
  /** Cuántas palabras tiene el término (después de tokenizar). */
  readonly palabras: number;
  /** SHA-256 en hexadecimal de las palabras normalizadas, unidas con un espacio. */
  readonly hash: string;
}

export interface Coincidencia {
  /** Línea del archivo donde apareció (1-based). */
  readonly linea: number;
  /** Hash del término que coincidió (nunca el texto en claro). */
  readonly hash: string;
}

/**
 * Minúsculas y sin diacríticos: "Gómez" y "gomez" normalizan igual. La clase
 * del `replace` es el rango de marcas combinantes U+0300–U+036F (Biome
 * reescribe el escape `̀-ͯ` a los caracteres literales; el rango es
 * el mismo, solo cambia cómo se ve en el editor).
 */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Palabras de `texto`, en el orden en que aparecen (letras, números, `_`). */
export function tokenizar(texto: string): string[] {
  return normalizar(texto).match(/[a-z0-9_]+/g) ?? [];
}

/** SHA-256 hexadecimal de las palabras (ya normalizadas) unidas con un espacio. */
export function hashDeFrase(palabras: readonly string[]): string {
  return createHash("sha256").update(palabras.join(" ")).digest("hex");
}

/**
 * Hashes de `terminos` que aparecen como n-grama consecutivo en `linea`
 * (sin duplicar si aparece más de una vez en la misma línea).
 */
function coincidenciasEnLinea(
  linea: string,
  terminos: readonly TerminoProhibido[],
): Set<string> {
  const tokens = tokenizar(linea);
  const hashesPorLongitud = new Map<number, Set<string>>();
  for (const termino of terminos) {
    const conjunto = hashesPorLongitud.get(termino.palabras) ?? new Set();
    conjunto.add(termino.hash);
    hashesPorLongitud.set(termino.palabras, conjunto);
  }

  const encontrados = new Set<string>();
  for (const [longitud, hashes] of hashesPorLongitud) {
    for (let inicio = 0; inicio + longitud <= tokens.length; inicio++) {
      const frase = tokens.slice(inicio, inicio + longitud);
      const hash = hashDeFrase(frase);
      if (hashes.has(hash)) {
        encontrados.add(hash);
      }
    }
  }
  return encontrados;
}

/** Todas las coincidencias de `terminos` en `contenido`, línea por línea. */
export function encontrarCoincidencias(
  contenido: string,
  terminos: readonly TerminoProhibido[],
): Coincidencia[] {
  if (terminos.length === 0) {
    return [];
  }
  const resultado: Coincidencia[] = [];
  const lineas = contenido.split(/\r?\n/);
  lineas.forEach((linea, indice) => {
    for (const hash of coincidenciasEnLinea(linea, terminos)) {
      resultado.push({ linea: indice + 1, hash });
    }
  });
  return resultado;
}
