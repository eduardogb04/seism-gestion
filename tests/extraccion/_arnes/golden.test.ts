/**
 * F0-16: el arnés de golden files. Se prueba contra una carpeta temporal
 * propia de cada test —nunca `tests/extraccion/golden/`, la carpeta real—
 * para no depender de goldens versionados ni ensuciarlos.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compararConGoldenEn } from "./golden.ts";

let carpeta: string;

beforeEach(() => {
  carpeta = mkdtempSync(join(tmpdir(), "golden-"));
  // Aunque la corrida entera venga con ACTUALIZAR_GOLDEN=si (por ejemplo,
  // corriendo este mismo test con `npm run test:golden:update`), cada test
  // arranca en modo "comparar": el que quiere modo "escribir" lo prende él.
  delete process.env.ACTUALIZAR_GOLDEN;
});

afterEach(() => {
  rmSync(carpeta, { recursive: true, force: true });
  delete process.env.ACTUALIZAR_GOLDEN;
});

describe("compararConGolden", () => {
  it("si el golden no existe, falla y no lo crea", () => {
    expect(() => compararConGoldenEn(carpeta, "no-existe", { a: 1 })).toThrow(
      /falta el golden/,
    );
    expect(() => readFileSync(join(carpeta, "no-existe.json"))).toThrow();
  });

  it("con ACTUALIZAR_GOLDEN=si escribe el archivo y lo avisa en pantalla", () => {
    const escritos: string[] = [];
    const originalLog = console.log;
    console.log = (mensaje: string) => {
      escritos.push(mensaje);
    };

    process.env.ACTUALIZAR_GOLDEN = "si";
    try {
      compararConGoldenEn(carpeta, "nuevo", { b: 2, a: 1 });
    } finally {
      console.log = originalLog;
    }

    const contenido = readFileSync(join(carpeta, "nuevo.json"), "utf-8");
    expect(contenido).toBe('{\n  "a": 1,\n  "b": 2\n}\n');
    expect(escritos.some((linea) => linea.includes("regenerado"))).toBe(true);
  });

  it("pasa cuando el valor coincide con el golden ya escrito", () => {
    process.env.ACTUALIZAR_GOLDEN = "si";
    compararConGoldenEn(carpeta, "coincide", { a: 1 });
    delete process.env.ACTUALIZAR_GOLDEN;

    expect(() =>
      compararConGoldenEn(carpeta, "coincide", { a: 1 }),
    ).not.toThrow();
  });

  it("ordena las claves: da igual en qué orden se arma el objeto", () => {
    process.env.ACTUALIZAR_GOLDEN = "si";
    compararConGoldenEn(carpeta, "orden", { z: 1, a: 2 });
    delete process.env.ACTUALIZAR_GOLDEN;

    expect(() =>
      compararConGoldenEn(carpeta, "orden", { a: 2, z: 1 }),
    ).not.toThrow();
  });

  it("si alguien edita el golden a mano, el siguiente valor igual (real) no le coincide y falla", () => {
    process.env.ACTUALIZAR_GOLDEN = "si";
    compararConGoldenEn(carpeta, "editado", { a: 1 });
    delete process.env.ACTUALIZAR_GOLDEN;

    expect(() => compararConGoldenEn(carpeta, "editado", { a: 2 })).toThrow();
  });

  it("rechaza una fecha del sistema dentro del valor", () => {
    expect(() =>
      compararConGoldenEn(carpeta, "con-fecha", { cuando: new Date() }),
    ).toThrow(/fecha del sistema/);
  });
});
