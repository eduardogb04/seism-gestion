/**
 * El almacén de documentos en una carpeta local (F0-27, ADR 0022): la
 * implementación de `ALMACEN=disco`. Pasa la misma suite de contrato que la
 * de S3 (`tests/contratos/almacen-documentos.ts`).
 *
 * - Cada clave es una ruta relativa a `directorio` (`documentos/2031/<uuid>`).
 *   La clave se valida antes de tocar el disco (`referenciaDesde`): sin `..`,
 *   sin barras al principio ni barra invertida, nada puede salir de la carpeta.
 * - Archivos con permisos `600` y carpetas con `700`: solo el usuario que
 *   corre la app los lee.
 * - Escritura atómica: se escribe un temporal al lado y se renombra. Quien
 *   lee ve el archivo viejo o el nuevo entero, nunca uno a medio escribir.
 *   El temporal lleva un `.` en el nombre, que ninguna clave puede tener.
 * - `urlTemporal` devuelve la ruta que va a servir la app
 *   (`/api/documentos/<clave>?expira=<epoch en segundos>`); esa ruta llega con
 *   la interfaz de subida, fuera de esta tarea.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import {
  type ErrorSistema,
  nuevoError,
} from "../../dominio/compartido/errores/error-sistema.ts";
import {
  type AlmacenDocumentos,
  exigirMinutosValidos,
  type Referencia,
  referenciaDesde,
} from "../../puertos/almacen-documentos.ts";

const PERMISOS_ARCHIVO = 0o600;
const PERMISOS_CARPETA = 0o700;

/** Los códigos de `fs` que quieren decir "ahí no hay un archivo". */
const NO_EXISTE = new Set(["ENOENT", "ENOTDIR", "EISDIR"]);

export interface OpcionesAlmacenDisco {
  /** La carpeta raíz; si no existe, se crea (con `700`). */
  readonly directorio: string;
  /** La hora para el vencimiento de `urlTemporal`, en milisegundos. Por defecto, la del sistema. */
  readonly ahoraMs?: () => number;
}

function codigoDeFs(error: unknown): string | undefined {
  if (error instanceof Error && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}

function errorDeDisco(
  operacion: string,
  clave: string,
  causa: unknown,
): ErrorSistema {
  return nuevoError(catalogo.INF_0001, { operacion, clave }, causa);
}

export function crearAlmacenDisco(
  opciones: OpcionesAlmacenDisco,
): AlmacenDocumentos {
  const raiz = path.resolve(opciones.directorio);
  const ahoraMs = opciones.ahoraMs ?? Date.now;

  /** La ruta de una referencia, validándola otra vez: puede venir de la base. */
  const rutaDe = (referencia: string): string =>
    path.join(raiz, ...referenciaDesde(referencia).split("/"));

  return {
    async guardar(clave, bytes): Promise<Referencia> {
      const referencia = referenciaDesde(clave);
      const ruta = rutaDe(referencia);
      const temporal = `${ruta}.${randomUUID()}.tmp`;
      try {
        await mkdir(path.dirname(ruta), {
          recursive: true,
          mode: PERMISOS_CARPETA,
        });
        await writeFile(temporal, bytes, {
          mode: PERMISOS_ARCHIVO,
          flag: "wx",
        });
        await rename(temporal, ruta);
      } catch (error) {
        await rm(temporal, { force: true }).catch(() => undefined);
        throw errorDeDisco("guardar", referencia, error);
      }
      return referencia;
    },

    async leer(referencia) {
      const ruta = rutaDe(referencia);
      try {
        const contenido = await readFile(ruta);
        return new Uint8Array(
          contenido.buffer,
          contenido.byteOffset,
          contenido.byteLength,
        );
      } catch (error) {
        const codigo = codigoDeFs(error);
        if (codigo !== undefined && NO_EXISTE.has(codigo)) {
          throw nuevoError(catalogo.ALM_0001, { clave: referencia }, error);
        }
        throw errorDeDisco("leer", referencia, error);
      }
    },

    async existe(referencia) {
      const ruta = rutaDe(referencia);
      try {
        return (await stat(ruta)).isFile();
      } catch (error) {
        const codigo = codigoDeFs(error);
        if (codigo !== undefined && NO_EXISTE.has(codigo)) {
          return false;
        }
        throw errorDeDisco("existe", referencia, error);
      }
    },

    async urlTemporal(referencia, minutos) {
      const clave = referenciaDesde(referencia);
      exigirMinutosValidos(minutos);
      const expira = Math.floor(ahoraMs() / 1000) + minutos * 60;
      return `/api/documentos/${clave}?expira=${expira}`;
    },
  };
}
