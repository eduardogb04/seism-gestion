/**
 * `/salud` no lleva JavaScript de cliente ni librerías de UI (F0-26, R8): es
 * HTML servido desde el servidor y se recarga con F5. Como en la protección
 * del panel, se recorre el código en vez de confiar en la memoria de quien
 * agregue el próximo archivo a `src/app/salud/`:
 *
 * - ningún archivo declara `"use client"`;
 * - ninguno trae un `<script>` propio ni una recarga automática
 *   (`http-equiv="refresh"`, `setInterval`, `setTimeout`);
 * - todo lo que importan es del propio repo (ruta relativa): ninguna librería
 *   de UI ni de componentes.
 *
 * El otro lado —que con JavaScript apagado el panel se ve igual— lo prueba el
 * e2e (`tests/e2e/humo.spec.ts`).
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const CARPETA = path.resolve(import.meta.dirname, "../../src/app/salud");

function archivosBajo(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    return entrada.isDirectory() ? archivosBajo(ruta) : [ruta];
  });
}

const ARCHIVOS = archivosBajo(CARPETA);

function conContenido(): [string, string][] {
  return ARCHIVOS.map((ruta) => [
    path.relative(CARPETA, ruta),
    readFileSync(ruta, "utf8"),
  ]);
}

describe("src/app/salud/**", () => {
  test("hay archivos que revisar", () => {
    expect(ARCHIVOS.length).toBeGreaterThanOrEqual(2);
  });

  test('ningún archivo declara "use client"', () => {
    const deCliente = conContenido()
      .filter(([, codigo]) => /^\s*["']use client["']/m.test(codigo))
      .map(([nombre]) => nombre);

    expect(deCliente).toEqual([]);
  });

  test("ningún archivo trae scripts propios ni recarga automática", () => {
    const conScript = conContenido()
      .filter(([, codigo]) =>
        /<script|http-equiv|setInterval|setTimeout|dangerouslySetInnerHTML/.test(
          codigo,
        ),
      )
      .map(([nombre]) => nombre);

    expect(conScript).toEqual([]);
  });

  test("solo importa del propio repo: ninguna librería de UI", () => {
    const externos = conContenido().flatMap(([nombre, codigo]) =>
      [...codigo.matchAll(/^import[^"']*["']([^"']+)["']/gm)]
        .map((coincidencia) => coincidencia[1] ?? "")
        .filter((origen) => !origen.startsWith("."))
        .map((origen) => `${nombre}: ${origen}`),
    );

    expect(externos).toEqual([]);
  });
});
