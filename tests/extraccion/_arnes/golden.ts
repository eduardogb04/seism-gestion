/**
 * El arnés de golden files del nivel **extracción** (F0-16): una entrada fija
 * tiene que seguir dando la misma salida fija. `compararConGolden(nombre,
 * valor)` serializa `valor` determinísticamente (claves ordenadas
 * recursivamente, así el orden en que se arma el objeto no importa) y lo
 * compara con `tests/extraccion/golden/<nombre>.json`.
 *
 * - Si el golden **no existe**, falla con un mensaje claro y no lo crea: eso
 *   es lo que hace `npm run test:golden:update` (`scripts/test-golden-update.ts`,
 *   variable `ACTUALIZAR_GOLDEN=si`), nunca una corrida normal ni CI.
 * - Si el valor trae una fecha del sistema (`Date`), rechaza antes de
 *   serializar: un golden con la hora de cuando corrió el test no es
 *   determinístico y nunca volvería a coincidir.
 * - La comparación es con `expect(...).toBe(...)` de Vitest, para que un
 *   golden que no coincide falle mostrando el diff.
 *
 * `compararConGoldenEn(carpeta, nombre, valor)` es la misma lógica con la
 * carpeta como parámetro: la usa el propio test del arnés
 * (`golden.test.ts`) contra una carpeta temporal, para no depender de los
 * goldens versionados ni ensuciarlos.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

/** `tests/extraccion/golden/`, la carpeta real de este nivel. */
export const CARPETA_GOLDEN_EXTRACCION = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "golden",
);

/** Puesta en `"si"`, `compararConGolden` reescribe en vez de comparar. */
const VARIABLE_ACTUALIZAR = "ACTUALIZAR_GOLDEN";

function ordenarClaves(valor: unknown): unknown {
  if (valor instanceof Date) {
    throw new Error(
      "compararConGolden: un golden no puede contener una fecha del sistema (Date); usá un valor fijo, por ejemplo un string ISO.",
    );
  }
  if (Array.isArray(valor)) {
    return valor.map(ordenarClaves);
  }
  if (valor !== null && typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;
    const ordenado: Record<string, unknown> = {};
    for (const clave of Object.keys(objeto).sort()) {
      ordenado[clave] = ordenarClaves(objeto[clave]);
    }
    return ordenado;
  }
  return valor;
}

/** Serialización determinística de un golden: claves ordenadas, JSON legible, un salto de línea al final. */
export function serializarGolden(valor: unknown): string {
  return `${JSON.stringify(ordenarClaves(valor), null, 2)}\n`;
}

/** `compararConGolden`, con la carpeta como parámetro (la usa el test del arnés). */
export function compararConGoldenEn(
  carpeta: string,
  nombre: string,
  valor: unknown,
): void {
  const ruta = join(carpeta, `${nombre}.json`);
  const serializado = serializarGolden(valor);

  if (process.env[VARIABLE_ACTUALIZAR] === "si") {
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(ruta, serializado);
    console.log(`golden regenerado a propósito: ${ruta}`);
    return;
  }

  if (!existsSync(ruta)) {
    throw new Error(
      `falta el golden "${nombre}" (${ruta}). No se crea solo: si es a propósito, correlo con "npm run test:golden:update".`,
    );
  }

  expect(serializado).toBe(readFileSync(ruta, "utf-8"));
}

/** Compara `valor` con `tests/extraccion/golden/<nombre>.json`. */
export function compararConGolden(nombre: string, valor: unknown): void {
  compararConGoldenEn(CARPETA_GOLDEN_EXTRACCION, nombre, valor);
}
