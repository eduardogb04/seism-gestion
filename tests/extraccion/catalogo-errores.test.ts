/**
 * F0-23: el catálogo de errores entero es un golden file
 * (`golden/catalogo-errores.json`). Agregar una entrada o cambiar un texto
 * rompe hasta regenerarlo a propósito (`npm run test:golden:update`) y
 * revisar el diff. Borrar una entrada o cambiarle el tipo **no se puede ni
 * regenerando**: un código nunca se reutiliza (ADR 0020). Por eso ese chequeo
 * corre contra el golden versionado **antes** de compararlo (y de
 * reescribirlo en modo actualización).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  CARPETA_GOLDEN_EXTRACCION,
  compararConGolden,
} from "./_arnes/golden.ts";

const NOMBRE = "catalogo-errores";

interface EntradaGolden {
  readonly codigo: string;
  readonly tipo: string;
}

function entradasDelGoldenVersionado(): [string, EntradaGolden][] {
  const ruta = join(CARPETA_GOLDEN_EXTRACCION, `${NOMBRE}.json`);
  if (!existsSync(ruta)) {
    return [];
  }
  return Object.entries(
    JSON.parse(readFileSync(ruta, "utf-8")) as Record<string, EntradaGolden>,
  );
}

/** Lo que el catálogo actual rompe respecto del golden versionado: borrados y cambios de tipo. */
function codigosReutilizados(): string[] {
  const actual: Readonly<Record<string, EntradaGolden | undefined>> = catalogo;
  const problemas: string[] = [];
  for (const [clave, anterior] of entradasDelGoldenVersionado()) {
    const hoy = actual[clave];
    if (hoy === undefined || hoy.codigo !== anterior.codigo) {
      problemas.push(`${anterior.codigo} ya no está en el catálogo (borrado)`);
    } else if (hoy.tipo !== anterior.tipo) {
      problemas.push(
        `${anterior.codigo} cambió de tipo: ${anterior.tipo} → ${hoy.tipo}`,
      );
    }
  }
  return problemas;
}

describe("catálogo de errores", () => {
  it("ningún código del golden se borra ni cambia de tipo, y el catálogo entero coincide con su golden", () => {
    expect(
      codigosReutilizados(),
      "Un código de error nunca se reutiliza (ADR 0020): no se borra ni cambia de tipo, tampoco regenerando el golden.",
    ).toEqual([]);
    compararConGolden(NOMBRE, catalogo);
  });
});
