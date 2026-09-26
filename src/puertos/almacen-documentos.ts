/**
 * Puerto del almacén de documentos (F0-27, ADR 0022). *"Los documentos van a
 * storage y en la base queda el metadato"*: esto guarda y devuelve los bytes;
 * la base guarda la `Referencia`.
 *
 * Dos implementaciones, y las dos pasan la misma suite de contrato
 * (`tests/contratos/almacen-documentos.ts`): `src/adaptadores/disco/` (una
 * carpeta local) y `src/adaptadores/s3/` (MinIO en local, R2 en el servidor).
 * Cuál se usa lo decide `ALMACEN` en `src/infraestructura/arranque/almacen.ts`.
 *
 * Los bytes van como `Uint8Array`, no como `Buffer` ni `Readable`: un puerto
 * no puede importar `node:*` (regla `puertos-solo-dominio`).
 *
 * Además de la interfaz vive acá la **única** validación de claves, la que
 * aplican los dos adaptadores antes de tocar nada: así una clave como
 * `documentos/../x` no llega nunca a una ruta de disco ni a un bucket.
 */

import { catalogo } from "../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../dominio/compartido/errores/error-sistema.ts";
import type { Reloj } from "../dominio/compartido/reloj.ts";
import type { GeneradorId } from "./generador-id.ts";

declare const marcaReferencia: unique symbol;

/**
 * Dónde quedó un documento: su clave ya validada. Es lo que se guarda en la
 * base. Solo la produce `referenciaDesde` (que valida) o `guardar`.
 */
export type Referencia = string & { readonly [marcaReferencia]: true };

export type AlmacenDocumentos = {
  /** Guarda los bytes bajo `clave` (pisa si ya existía) y devuelve su referencia. */
  guardar(
    clave: string,
    bytes: Uint8Array,
    tipoMime: string,
  ): Promise<Referencia>;
  /** Los bytes guardados. Si no existe, la promesa se rechaza con `ALM-0001`. */
  leer(referencia: Referencia): Promise<Uint8Array>;
  /** Si hay algo guardado bajo esa referencia. */
  existe(referencia: Referencia): Promise<boolean>;
  /**
   * Un enlace para descargarlo que vence a los `minutos` pedidos (de 1 a
   * `MINUTOS_MAXIMOS`; fuera de rango, `ALM-0003`). En S3, una URL firmada;
   * en disco, una ruta que va a servir la app.
   */
  urlTemporal(referencia: Referencia, minutos: number): Promise<string>;
};

/** Una clave: tramos de `[a-z0-9-]` separados por una barra, nada más. */
const PATRON_CLAVE = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/;
const LARGO_MAXIMO_CLAVE = 512;

/** El tope de vigencia de `urlTemporal`: una semana, lo máximo que firma S3. */
export const MINUTOS_MAXIMOS = 10_080;

/**
 * Valida una clave y la devuelve como `Referencia`. Falla con `ALM-0002` si
 * no cumple `PATRON_CLAVE` o se pasa de 512 caracteres: así quedan afuera
 * `..`, barras al principio, al final o dobles, barra invertida, espacios,
 * mayúsculas, acentos, cualquier no-ASCII y `%`.
 */
export function referenciaDesde(clave: string): Referencia {
  if (clave.length > LARGO_MAXIMO_CLAVE || !PATRON_CLAVE.test(clave)) {
    throw nuevoError(catalogo.ALM_0002, { clave });
  }
  return clave as Referencia;
}

/**
 * La clave de un documento nuevo: `documentos/<año>/<uuid>`. El año sale del
 * reloj inyectado, nunca de la fecha del sistema.
 */
export function claveDocumento(
  reloj: Reloj,
  generadorId: GeneradorId,
): Referencia {
  return referenciaDesde(
    `documentos/${reloj.ahora().anio}/${generadorId.generar()}`,
  );
}

/** Falla con `ALM-0003` si `minutos` no es un entero de 1 a `MINUTOS_MAXIMOS`. */
export function exigirMinutosValidos(minutos: number): void {
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > MINUTOS_MAXIMOS) {
    throw nuevoError(catalogo.ALM_0003, { minutos });
  }
}
