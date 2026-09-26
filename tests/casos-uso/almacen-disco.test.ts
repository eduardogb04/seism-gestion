import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearAlmacenDisco } from "../../src/adaptadores/disco/almacen-documentos.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import { crearAlmacenDocumentos } from "../../src/infraestructura/arranque/almacen.ts";
import type { Entorno } from "../../src/infraestructura/entorno.ts";
import { referenciaDesde } from "../../src/puertos/almacen-documentos.ts";
import { suiteAlmacenDocumentos } from "../contratos/almacen-documentos.ts";

/**
 * F0-27: el almacén en disco. La suite de contrato (la misma que corre S3) y
 * lo propio del disco: permisos, escritura atómica y el formato de
 * `urlTemporal`. Cada bloque trabaja en su carpeta temporal, que se borra al
 * terminar.
 */

const carpetas: string[] = [];

async function carpetaTemporal(): Promise<string> {
  const carpeta = await mkdtemp(path.join(tmpdir(), "seism-almacen-"));
  carpetas.push(carpeta);
  return carpeta;
}

afterAll(async () => {
  for (const carpeta of carpetas) {
    await rm(carpeta, { recursive: true, force: true });
  }
});

// 100 corridas de hasta 256 KB contra el disco tardan un par de segundos: el
// disco local es barato, así que se prueban más casos que contra S3 (25).
suiteAlmacenDocumentos(
  "disco",
  async () =>
    crearAlmacenDisco({
      directorio: path.join(await carpetaTemporal(), "almacen"),
    }),
  { numRuns: 100 },
);

describe("almacén en disco: lo propio del adaptador", () => {
  let raiz: string;

  beforeAll(async () => {
    // Una carpeta que todavía no existe: la crea el adaptador, con sus permisos.
    raiz = path.join(await carpetaTemporal(), "almacen");
  });

  // Los permisos POSIX no existen en Windows (Node informa 0o666 para todo
  // archivo): este caso se saltea ahí. CI corre en Linux y lo verifica.
  it.skipIf(process.platform === "win32")(
    "los archivos quedan con permisos 600 y las carpetas que crea con 700",
    async () => {
      const almacen = crearAlmacenDisco({ directorio: raiz });
      await almacen.guardar(
        "documentos/2031/permisos",
        Uint8Array.of(1, 2),
        "text/plain",
      );
      const archivo = await stat(
        path.join(raiz, "documentos", "2031", "permisos"),
      );
      expect(archivo.mode & 0o777).toBe(0o600);
      for (const carpeta of [
        raiz,
        path.join(raiz, "documentos"),
        path.join(raiz, "documentos", "2031"),
      ]) {
        expect((await stat(carpeta)).mode & 0o777).toBe(0o700);
      }
    },
  );

  it("escribe de forma atómica: después de guardar no queda ningún archivo temporal al lado", async () => {
    const almacen = crearAlmacenDisco({ directorio: raiz });
    await almacen.guardar(
      "documentos/2032/atomico",
      new Uint8Array(100_000).fill(7),
      "text/plain",
    );
    await almacen.guardar(
      "documentos/2032/atomico",
      Uint8Array.of(8),
      "text/plain",
    );
    expect(await readdir(path.join(raiz, "documentos", "2032"))).toEqual([
      "atomico",
    ]);
  });

  it("urlTemporal devuelve /api/documentos/<clave>?expira=<epoch en segundos> y vence a los minutos pedidos", async () => {
    // 2031-01-01T00:00:00.500Z, fijo: el adaptador toma la hora de acá.
    const ahoraMs = 1_924_992_000_500;
    const almacen = crearAlmacenDisco({
      directorio: raiz,
      ahoraMs: () => ahoraMs,
    });
    const referencia = referenciaDesde("documentos/2031/url");
    expect(await almacen.urlTemporal(referencia, 15)).toBe(
      `/api/documentos/documentos/2031/url?expira=${1_924_992_000 + 15 * 60}`,
    );
    expect(await almacen.urlTemporal(referencia, 1)).toBe(
      `/api/documentos/documentos/2031/url?expira=${1_924_992_000 + 60}`,
    );
  });

  it("si el disco falla por otra cosa que no sea 'no existe', guardar falla con INF-0001 y la causa", async () => {
    const archivoSuelto = path.join(await carpetaTemporal(), "soy-un-archivo");
    await writeFile(archivoSuelto, "no soy una carpeta");
    const almacen = crearAlmacenDisco({ directorio: archivoSuelto });
    await expect(
      almacen.guardar("documentos/2031/x", Uint8Array.of(1), "text/plain"),
    ).rejects.toMatchObject({
      codigo: catalogo.INF_0001.codigo,
      detalles: { operacion: "guardar", clave: "documentos/2031/x" },
      cause: expect.anything(),
    });
  });
});

describe("arranque: ALMACEN=disco", () => {
  it("arma el almacén en disco sobre ALMACEN_DIRECTORIO", async () => {
    const directorio = await carpetaTemporal();
    const entorno: Entorno = {
      APP_ENTORNO: "local",
      DATABASE_URL: "postgresql://ficticio:ficticio@localhost:5432/ficticia",
      ALMACEN: "disco",
      ALMACEN_DIRECTORIO: directorio,
    };
    const almacen = crearAlmacenDocumentos(entorno);
    await almacen.guardar(
      "documentos/2031/arranque",
      Uint8Array.of(4, 2),
      "text/plain",
    );
    const archivo = await stat(
      path.join(directorio, "documentos", "2031", "arranque"),
    );
    expect(archivo.size).toBe(2);
  });
});
