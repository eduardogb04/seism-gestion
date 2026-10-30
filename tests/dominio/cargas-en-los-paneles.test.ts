/**
 * Cada carga funciona desde su panel (F6-04). La tabla de cargas de
 * `estados.ts` (`ETAPAS_DE_CARGA`) dice qué se puede cargar en cada etapa; estas
 * pruebas la recorren contra el código de los paneles de «Adjudicado» en
 * adelante y las salidas, sin una lista de cargas escrita a mano:
 *
 * - toda carga que la etapa admite tiene su botón (`data-carga="<carga>"` o
 *   `carga: "<carga>"`) en el archivo del panel o en una pieza que ese panel
 *   importa;
 * - el archivo del panel no marca ninguna carga que la etapa no admite.
 *
 * Los botones de las piezas compartidas ya se esconden solos según la etapa (la
 * pantalla lo comprueba en `tests/e2e/etapas.spec.ts`). `suceso` es de la
 * columna lateral del layout, igual en todas las etapas: se revisa aparte.
 * «Creado» y «Cotizado» (F6-01) quedan afuera: `cobro` se admite ahí aunque
 * todavía no hay facturas que cobrar.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { esSoloLectura } from "../../src/app/servicios/[id]/estado-del-servicio.tsx";
import {
  admiteCarga,
  type Carga,
  ESTADOS_SERVICIO,
  type EstadoServicio,
  ETAPAS_DE_CARGA,
} from "../../src/dominio/servicios/estados.ts";

const RAIZ = path.resolve(import.meta.dirname, "../../src/app");
const SERVICIOS = path.join(RAIZ, "servicios");
const PANELES = path.join(SERVICIOS, "[id]");

const PANEL_DE: Readonly<Partial<Record<EstadoServicio, string>>> = {
  adjudicado: "panel-adjudicado.tsx",
  en_ejecucion: "panel-en-ejecucion.tsx",
  finalizado: "panel-finalizado.tsx",
  cerrado: "panel-cerrado.tsx",
  perdido: "panel-salida.tsx",
  sin_respuesta: "panel-salida.tsx",
  cancelado: "panel-salida.tsx",
};

const CARGAS = Object.keys(ETAPAS_DE_CARGA) as Carga[];
const MARCA = /(?:data-carga="|carga:\s*")(\w+)"/g;
const IMPORTA = /from "(\.[^"]+)"/g;

function archivosBajo(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    return entrada.isDirectory() ? archivosBajo(ruta) : [ruta];
  });
}

const marcasDe = (archivo: string): Carga[] =>
  [...readFileSync(archivo, "utf8").matchAll(MARCA)].map(
    ([, carga]) => carga as Carga,
  );

/** El archivo y las piezas de `src/app/servicios` que importa, hasta el fondo. */
function conSusPiezas(archivo: string, vistos = new Set<string>()): string[] {
  vistos.add(archivo);
  for (const [, relativa] of readFileSync(archivo, "utf8").matchAll(IMPORTA)) {
    const importado = [".tsx", ".ts"]
      .map((extension) =>
        path
          .resolve(path.dirname(archivo), relativa ?? "")
          .replace(/\.tsx?$/, extension),
      )
      .find((posible) => existsSync(posible));
    if (importado?.startsWith(SERVICIOS) && !vistos.has(importado)) {
      conSusPiezas(importado, vistos);
    }
  }
  return [...vistos];
}

const ETAPAS_CON_PANEL = ESTADOS_SERVICIO.filter(
  (estado) => PANEL_DE[estado] !== undefined,
);

describe("cada carga que una etapa admite tiene su botón en el panel, y ninguna otra", () => {
  test("los paneles de «Adjudicado» en adelante y las salidas están en la lista", () => {
    expect(ETAPAS_CON_PANEL).toEqual(
      ESTADOS_SERVICIO.filter(
        (estado) => estado !== "creado" && estado !== "cotizado",
      ),
    );
  });

  test.each(ETAPAS_CON_PANEL.map((estado) => [estado]))("%s", (estado) => {
    const archivo = path.join(PANELES, PANEL_DE[estado] ?? "");
    const admitidas = CARGAS.filter(
      (carga) => carga !== "suceso" && admiteCarga(estado, carga),
    );
    const delPanel = new Set(marcasDe(archivo));
    const conPiezas = new Set(conSusPiezas(archivo).flatMap(marcasDe));

    expect(admitidas.filter((carga) => !conPiezas.has(carga))).toEqual([]);
    expect([...delPanel].filter((carga) => !admitidas.includes(carga))).toEqual(
      [],
    );
  });

  test("las etapas que no admiten ninguna carga (Cerrado) no marcan ningún botón en su panel", () => {
    const archivo = path.join(PANELES, PANEL_DE.cerrado ?? "");
    expect(CARGAS.filter((carga) => admiteCarga("cerrado", carga))).toEqual([]);
    expect(marcasDe(archivo)).toEqual([]);
  });
});

describe("`suceso`, de la columna lateral", () => {
  test("su botón está en la columna y el layout la ofrece donde la tabla lo admite", () => {
    expect(marcasDe(path.join(PANELES, "sucesos.tsx"))).toContain("suceso");
    for (const estado of ESTADOS_SERVICIO) {
      expect(esSoloLectura(estado), estado).toBe(
        !admiteCarga(estado, "suceso"),
      );
    }
  });
});

describe("la tabla `VISTAS` de secciones ya no existe", () => {
  test("`etapas.tsx` no vuelve y nada dibuja las etapas con `VISTAS` o `SECCIONES`", () => {
    expect(existsSync(path.join(PANELES, "etapas.tsx"))).toBe(false);
    const quedan = archivosBajo(SERVICIOS).filter((archivo) =>
      /\b(VISTAS|SECCIONES|VistaDeEtapa)\b/.test(readFileSync(archivo, "utf8")),
    );
    expect(quedan).toEqual([]);
  });
});
