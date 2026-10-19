/**
 * Las pantallas solo usan los colores con nombre de los temas (F3-05, ADR
 * 0040): un `bg-gray-100`, un `text-white` o un `#1d4ed8` sueltos se ven bien
 * en un tema y mal en el otro. Se recorre `src/app/` para que lo vea también
 * la pantalla que se sume después.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const RAIZ = path.resolve(import.meta.dirname, "../../src/app");

function archivosBajo(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    return entrada.isDirectory() ? archivosBajo(ruta) : [ruta];
  });
}

const PALETA_CRUDA =
  /\b(?:bg|text|border|outline|ring|fill|stroke|divide)-(?:(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|white|black)\b/g;
/** Un color hex; `&#123;` es una entidad HTML, no un color. */
const HEX = /(?<!&)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;

test("ningún archivo de src/app usa un color fuera de los temas", () => {
  const archivos = archivosBajo(RAIZ).filter((ruta) => /\.tsx?$/.test(ruta));
  expect(archivos.length).toBeGreaterThan(20);

  const sueltos = archivos.flatMap((ruta) =>
    readFileSync(ruta, "utf8")
      .split("\n")
      .flatMap((linea, indice) =>
        [...linea.matchAll(PALETA_CRUDA), ...linea.matchAll(HEX)].map(
          ([color]) =>
            `${path.relative(RAIZ, ruta).replaceAll("\\", "/")}:${indice + 1} ${color}`,
        ),
      ),
  );

  expect(sueltos).toEqual([]);
});
