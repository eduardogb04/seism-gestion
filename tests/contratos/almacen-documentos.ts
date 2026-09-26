/**
 * Suite de contrato del puerto `AlmacenDocumentos` (F0-27,
 * `src/puertos/almacen-documentos.ts`). La corren, **la misma**, las dos
 * implementaciones:
 *
 * - `tests/casos-uso/almacen-disco.test.ts` — disco, contra una carpeta temporal.
 * - `tests/casos-uso/almacen-s3.test.ts` — S3, contra MinIO levantado con
 *   Testcontainers y con el `docker-compose.yml` del repo.
 *
 * Lo que es propio de cada una (permisos en disco, la URL firmada que
 * descarga en S3) va en su archivo, no acá.
 */

import { randomUUID } from "node:crypto";
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import type {
  AlmacenDocumentos,
  Referencia,
} from "../../src/puertos/almacen-documentos.ts";

/**
 * Claves que **tienen** que rechazarse con `ALM-0002`, en `guardar` y también
 * si llegan disfrazadas de `Referencia` a `leer`, `existe` o `urlTemporal`.
 * `tests/dominio/almacen-claves.test.ts` exige que estén los casos de la
 * ficha y que sean al menos 10.
 */
export const CLAVES_INVALIDAS: readonly string[] = [
  "",
  "documentos/../secreto",
  "../fuera-del-almacen",
  "documentos/./abc",
  "/documentos/2031/abc",
  "documentos/2031/abc/",
  "documentos//abc",
  "documentos\\2031\\abc",
  "documentos/2031/a b",
  " documentos/2031/abc",
  "documentos/2031/abc\n",
  "Documentos/2031/abc",
  "documentos/2031/ABC",
  "documentos/2031/canción",
  "documentos/2031/ñandu",
  "documentos/2031/名前",
  "documentos/2031/a%2fb",
  "documentos/2031/%2e%2e",
  "documentos/2031/informe.pdf",
  "documentos/2031/a_b",
  "documentos/2031/a\u0000b",
  "x".repeat(513),
];

export interface OpcionesSuite {
  /**
   * Corridas de la propiedad de bytes. Cada archivo lo fija con el porqué:
   * guardar 256 KB contra un servidor tarda más que contra el disco.
   */
  readonly numRuns: number;
}

/** Hasta 256 KB por corrida (R6 de la ficha de F0-27). */
const BYTES_MAXIMOS = 262_144;

/** Una clave válida que ningún otro test usa. */
function claveNueva(): string {
  return `documentos/contrato/${randomUUID()}`;
}

/** Igualdad byte a byte (con el largo), sin pasar por arrays de JS. */
function mismosBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

const conCodigo = (codigo: string) => expect.objectContaining({ codigo });

export function suiteAlmacenDocumentos(
  nombre: string,
  fabrica: () => Promise<AlmacenDocumentos>,
  opciones: OpcionesSuite,
): void {
  describe(`contrato AlmacenDocumentos: ${nombre}`, () => {
    let almacen: AlmacenDocumentos;

    beforeAll(async () => {
      almacen = await fabrica();
    });

    it("guardar y leer devuelve los mismos bytes (propiedad, bytes al azar de 0 a 256 KB)", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 0, maxLength: BYTES_MAXIMOS }),
          async (bytes) => {
            const referencia = await almacen.guardar(
              claveNueva(),
              bytes,
              "application/octet-stream",
            );
            const leidos = await almacen.leer(referencia);
            expect(leidos).toBeInstanceOf(Uint8Array);
            expect(mismosBytes(leidos, bytes)).toBe(true);
          },
        ),
        { numRuns: opciones.numRuns },
      );
    });

    it("guardar vacío y los 256 valores de un byte también ida y vuelta (casos borde fijos)", async () => {
      const todos = Uint8Array.from({ length: 256 }, (_, i) => i);
      for (const bytes of [new Uint8Array(0), todos]) {
        const referencia = await almacen.guardar(
          claveNueva(),
          bytes,
          "application/octet-stream",
        );
        expect(mismosBytes(await almacen.leer(referencia), bytes)).toBe(true);
      }
    });

    it("guardar devuelve la clave como referencia y pisa lo que hubiera", async () => {
      const clave = claveNueva();
      const primera = await almacen.guardar(
        clave,
        Uint8Array.of(1, 2, 3),
        "text/plain",
      );
      expect(primera).toBe(clave);
      const segunda = await almacen.guardar(
        clave,
        Uint8Array.of(9),
        "text/plain",
      );
      expect(segunda).toBe(clave);
      expect(mismosBytes(await almacen.leer(segunda), Uint8Array.of(9))).toBe(
        true,
      );
    });

    it("existe es coherente: false antes de guardar, true después, y solo para esa clave", async () => {
      const clave = claveNueva();
      const otra = claveNueva();
      expect(await almacen.existe(clave as Referencia)).toBe(false);
      const referencia = await almacen.guardar(
        clave,
        Uint8Array.of(7),
        "application/pdf",
      );
      expect(await almacen.existe(referencia)).toBe(true);
      expect(await almacen.existe(otra as Referencia)).toBe(false);
    });

    it("existe no confunde un prefijo con un documento", async () => {
      const base = claveNueva();
      await almacen.guardar(`${base}/hijo`, Uint8Array.of(1), "text/plain");
      expect(await almacen.existe(base as Referencia)).toBe(false);
      await expect(almacen.leer(base as Referencia)).rejects.toThrow(
        conCodigo(catalogo.ALM_0001.codigo),
      );
    });

    it("leer lo que no existe falla con ALM-0001 y el detalle trae la clave", async () => {
      const clave = claveNueva();
      await expect(almacen.leer(clave as Referencia)).rejects.toMatchObject({
        codigo: catalogo.ALM_0001.codigo,
        detalles: { clave },
      });
    });

    it.each(CLAVES_INVALIDAS.map((clave) => [clave]))(
      "guardar rechaza la clave %j con ALM-0002",
      async (clave) => {
        await expect(
          almacen.guardar(clave, Uint8Array.of(1), "text/plain"),
        ).rejects.toThrow(conCodigo(catalogo.ALM_0002.codigo));
      },
    );

    it("leer, existe y urlTemporal también rechazan una clave inválida disfrazada de Referencia", async () => {
      for (const clave of CLAVES_INVALIDAS) {
        const disfrazada = clave as Referencia;
        const codigo = conCodigo(catalogo.ALM_0002.codigo);
        await expect(almacen.leer(disfrazada)).rejects.toThrow(codigo);
        await expect(almacen.existe(disfrazada)).rejects.toThrow(codigo);
        await expect(almacen.urlTemporal(disfrazada, 5)).rejects.toThrow(
          codigo,
        );
      }
    });

    it("urlTemporal rechaza una vigencia fuera de 1..10080 minutos con ALM-0003", async () => {
      const referencia = await almacen.guardar(
        claveNueva(),
        Uint8Array.of(1),
        "text/plain",
      );
      for (const minutos of [0, -5, 10_081, 2.5]) {
        await expect(almacen.urlTemporal(referencia, minutos)).rejects.toThrow(
          conCodigo(catalogo.ALM_0003.codigo),
        );
      }
      await expect(almacen.urlTemporal(referencia, 10_080)).resolves.toEqual(
        expect.any(String),
      );
    });
  });
}
