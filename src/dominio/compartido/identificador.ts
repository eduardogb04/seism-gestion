/**
 * Identificador doble de toda entidad de negocio (F0-19; DISENO sección 2,
 * decisión 6): un UUID interno para relacionar filas entre tablas, y un
 * código legible (`SRV-2026-014`) para hablar de un caso por WhatsApp o por
 * teléfono sin dictar un UUID.
 *
 * Puro, como todo `src/dominio` (dependency-cruiser, regla `dominio-puro`):
 * no genera UUIDs (eso lo hace el puerto `GeneradorId`, en
 * `src/puertos/generador-id.ts`, con un adaptador fuera del dominio) y no
 * pide la fecha del sistema. El año de `CodigoLegible` nunca sale de `Date`
 * acá adentro: `generarCodigoLegible` lo toma del `Reloj` inyectado
 * (`src/dominio/compartido/reloj.ts`, F0-18), vía `reloj.ahora().anio`.
 * `formatearCodigo` en sí sigue siendo pura y sin puerto, porque también la
 * usa `generarCodigoLegible` para el resto de las reglas (prefijo,
 * secuencia, ensanche) y `parsearCodigo` necesita poder reconstruir y
 * reformatear un código ya existente, de un año que no es "ahora".
 */

/**
 * Marca de tipo fantasma: no existe en runtime (`declare const`, sin
 * inicializar), solo distingue tipos en tiempo de compilación. Dos
 * `Identificador<Marca>` con `Marca` distinta no son intercambiables, aunque
 * en runtime los dos sean el mismo string (un UUID). Ver
 * `tests/dominio/identificador.test.ts` para la prueba con `@ts-expect-error`.
 */
import type { Reloj } from "./reloj.ts";

declare const marcaIdentificador: unique symbol;

/** Un identificador interno (UUID) marcado por tipo de entidad. */
export type Identificador<Marca extends string> = string & {
  readonly [marcaIdentificador]: Marca;
};

/**
 * Da forma de `Identificador<Marca>` a un UUID ya generado (por un
 * `GeneradorId`, fuera de acá) o ya leído de la base. No genera nada, no
 * valida el formato de UUID: eso es responsabilidad de quien lo produjo.
 */
export function identificadorDesde<Marca extends string>(
  valor: string,
): Identificador<Marca> {
  return valor as Identificador<Marca>;
}

/** Marca de tipo fantasma de `CodigoLegible`, con el mismo mecanismo de arriba. */
declare const marcaCodigoLegible: unique symbol;

/**
 * Un código legible ya válido, con forma `PREFIJO-AAAA-NNN` (o `NNNN`,
 * `NNNNN`... al superar 999 — "se ensancha a 4 dígitos", sin techo: sigue
 * ensanchando si hiciera falta, sin romper el parseo). Solo lo producen
 * `formatearCodigo` (que valida) y `parsearCodigo` (que ya recibió uno
 * bueno): no hay forma de fabricar uno "a mano" que no haya pasado por acá.
 */
export type CodigoLegible = string & { readonly [marcaCodigoLegible]: true };

/** Los datos detrás de un `CodigoLegible`, antes o después de formatear/parsear. */
export type DatosCodigoLegible = {
  readonly prefijo: string;
  readonly anio: number;
  readonly secuencia: number;
};

export type ResultadoFormatearCodigo =
  | { readonly ok: true; readonly codigo: CodigoLegible }
  | { readonly ok: false; readonly mensaje: string };

/** Prefijo: exactamente 3 letras mayúsculas. Los prefijos concretos por entidad (`SRV`, `FAC`...) los define Fase 1 — acá no se conoce ninguno. */
const PATRON_PREFIJO = /^[A-Z]{3}$/;

/** Cuántos dígitos rellena como mínimo la secuencia antes de ensanchar. */
const DIGITOS_MINIMOS_SECUENCIA = 3;

/**
 * Arma un `CodigoLegible` a partir de sus datos, o dice por qué no puede.
 * Pura: no consulta ningún puerto (`Secuencias`, `GeneradorId` o el reloj);
 * quien la llama ya resolvió `anio` y `secuencia` antes de invocarla.
 */
export function formatearCodigo(
  datos: DatosCodigoLegible,
): ResultadoFormatearCodigo {
  const { prefijo, anio, secuencia } = datos;

  if (!PATRON_PREFIJO.test(prefijo)) {
    return {
      ok: false,
      mensaje: `prefijo inválido: "${prefijo}" (tiene que ser exactamente 3 letras mayúsculas).`,
    };
  }
  if (!Number.isInteger(anio) || anio < 1000 || anio > 9999) {
    return {
      ok: false,
      mensaje: `año inválido: ${anio} (tiene que ser un entero de 4 dígitos, entre 1000 y 9999).`,
    };
  }
  if (!Number.isInteger(secuencia) || secuencia < 1) {
    return {
      ok: false,
      mensaje: `secuencia inválida: ${secuencia} (tiene que ser un entero positivo, arrancando en 1).`,
    };
  }

  const numeroSecuencia = String(secuencia).padStart(
    DIGITOS_MINIMOS_SECUENCIA,
    "0",
  );
  return {
    ok: true,
    codigo: `${prefijo}-${anio}-${numeroSecuencia}` as CodigoLegible,
  };
}

/** Los datos que hacen falta para armar un `CodigoLegible` nuevo: todo salvo el año, que sale del reloj. */
export type DatosCodigoLegibleNuevo = Omit<DatosCodigoLegible, "anio">;

/**
 * Arma un `CodigoLegible` para un caso que se crea "ahora": el año sale del
 * `Reloj` inyectado (`reloj.ahora().anio`), nunca de `Date` ni de un
 * parámetro numérico que el llamador haya resuelto por su cuenta. Es la
 * única puerta de entrada para generar un código nuevo; delega en
 * `formatearCodigo` para el resto de las reglas (prefijo, secuencia,
 * ensanche) una vez resuelto el año.
 */
export function generarCodigoLegible(
  reloj: Reloj,
  datos: DatosCodigoLegibleNuevo,
): ResultadoFormatearCodigo {
  return formatearCodigo({ ...datos, anio: reloj.ahora().anio });
}

/**
 * Deshace `formatearCodigo`: acepta exactamente lo que esa función produce y
 * rechaza todo lo demás (`null`), incluida una secuencia con más ceros a la
 * izquierda de los que `formatearCodigo` habría puesto (`SRV-2026-0014`) o
 * con menos dígitos de los que hacen falta (`SRV-2026-01`): ninguna de las
 * dos es lo que `formatearCodigo` produciría para ningún número.
 */
export function parsearCodigo(valor: string): DatosCodigoLegible | null {
  const partes = valor.split("-");
  if (partes.length !== 3) {
    return null;
  }

  const [prefijo, anioTexto, secuenciaTexto] = partes;
  if (
    prefijo === undefined ||
    anioTexto === undefined ||
    secuenciaTexto === undefined
  ) {
    return null;
  }
  if (!PATRON_PREFIJO.test(prefijo)) {
    return null;
  }
  if (!/^\d{4}$/.test(anioTexto)) {
    return null;
  }
  if (!/^\d+$/.test(secuenciaTexto)) {
    return null;
  }

  const anio = Number(anioTexto);
  const secuencia = Number(secuenciaTexto);
  if (anio < 1000) {
    // El regex de arriba solo exige 4 dígitos: "0000".."0999" también
    // calzan, pero formatearCodigo nunca los produce ni los acepta (exige
    // 1000-9999). Sin este rechazo, parsearCodigo aceptaría códigos que
    // formatearCodigo no puede reconstruir (encontrado por la propiedad de
    // mutación de un carácter, F0-15, con fast-check).
    return null;
  }
  if (!Number.isSafeInteger(secuencia) || secuencia < 1) {
    return null;
  }

  // Rechaza cualquier forma que formatearCodigo no habría producido para
  // este número: ceros de más a la izquierda, o de menos.
  const formaCanonica = String(secuencia).padStart(
    DIGITOS_MINIMOS_SECUENCIA,
    "0",
  );
  if (formaCanonica !== secuenciaTexto) {
    return null;
  }

  return { prefijo, anio, secuencia };
}
