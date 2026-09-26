/**
 * El log estructurado (F0-24, ADR 0021). Pino, sin transportes ni
 * `pino-pretty`:
 *
 * - **Formato por entorno.** `APP_ENTORNO=local` → una línea legible
 *   (`HH:MM:SS nivel [referencia] mensaje {resto en JSON}`); `ci` y
 *   `servidor` → JSON de una línea (lo que se lee con `docker logs`).
 * - **Nivel por entorno.** `LOG_NIVEL` si está (`src/infraestructura/entorno.ts`);
 *   si no, `debug` en `local` e `info` en `ci` y `servidor`.
 * - **`referencia`** (el código legible del servicio o documento, tipo
 *   `SRV-2026-014`) como hilo conductor: `conReferencia(ref, fn)` corre `fn`
 *   con esa referencia en un `AsyncLocalStorage`, y cada línea que se escriba
 *   adentro —aunque sea después de varios `await`— la lleva sola. Fuera de un
 *   `conReferencia` la línea no tiene el campo.
 * - **Redacción de todo lo que sale.** Cada línea que arma pino se vuelve a
 *   leer y pasa por `redactar` antes de escribirse: campos a cualquier
 *   profundidad (errores serializados incluidos) y el mensaje. Pino `redact`
 *   no alcanza (trabaja por rutas exactas, no por "la clave contiene" ni por
 *   el valor). Ante la duda se redacta de más.
 * - **Sin `hostname` ni `pid`** (`base: null`): el nombre de una máquina
 *   personal también es un dato de alguien.
 *
 * El destino por defecto es la salida estándar **síncrona**: cuando la línea
 * vuelve de `log.fatal(...)` ya está escrita, así el proceso puede terminar
 * enseguida (`src/infraestructura/proceso.ts`).
 */

import { AsyncLocalStorage } from "node:async_hooks";
import pino from "pino";
import { esquemaEntorno, type NivelLog } from "./entorno.ts";

export type Log = pino.Logger;

/** Dónde escribe el log: por defecto la salida estándar; en los tests, memoria. */
export interface DestinoLog {
  write(linea: string): void;
}

export type FormatoLog = "json" | "legible";

export interface OpcionesLog {
  readonly formato: FormatoLog;
  readonly nivel: NivelLog;
  readonly destino?: DestinoLog;
}

/** Lo que reemplaza a un secreto o dato personal en la salida. */
export const REDACTADO = "[redactado]";

/**
 * Una clave cuyo valor entero se redacta si su nombre, en minúsculas,
 * **contiene** alguna de estas (`accessToken`, `CLAVE_API`, `x-api-secret`,
 * `set-cookie`, `proxy-authorization`...).
 */
const CLAVES_SENSIBLES = [
  "authorization",
  "cookie",
  "token",
  "secret",
  "password",
  "clave",
] as const;

/**
 * Algo que parece un email: cualquier tira sin espacios, una arroba y otra
 * tira sin espacios. Redacta de más (`usuario@host`, `a@b` en cualquier
 * texto) a propósito: el falso positivo cuesta menos que el negativo.
 */
const PATRON_EMAIL = /[^\s@]+@[^\s@]+/g;

/** Algo que parece un CUIT: 11 dígitos, con o sin guiones (`20-00000000-1`, `20000000001`). */
const PATRON_CUIT = /\b\d{2}-?\d{8}-?\d\b/g;

const almacenReferencia = new AsyncLocalStorage<string>();

/**
 * Corre `fn` con esa referencia: cada línea de log que se escriba adentro,
 * directa o después de cualquier `await`, lleva `referencia`. Devuelve lo que
 * devuelva `fn` (también una promesa).
 */
export function conReferencia<T>(referencia: string, fn: () => T): T {
  return almacenReferencia.run(referencia, fn);
}

function esClaveSensible(clave: string): boolean {
  const minuscula = clave.toLowerCase();
  return CLAVES_SENSIBLES.some((sensible) => minuscula.includes(sensible));
}

function redactarTexto(texto: string): string {
  return texto.replace(PATRON_EMAIL, REDACTADO).replace(PATRON_CUIT, REDACTADO);
}

/**
 * Devuelve una copia de `valor` sin secretos ni datos personales. Pura: no
 * toca el original.
 *
 * - En un objeto (a cualquier profundidad, arrays incluidos), el valor
 *   entero de una clave sensible (ver `CLAVES_SENSIBLES`) pasa a
 *   `[redactado]`.
 * - En cualquier texto (valores y claves), cada tramo que parezca email o
 *   CUIT pasa a `[redactado]`; el resto del texto queda.
 * - Un número que, escrito, parezca CUIT, pasa a `[redactado]`.
 */
export function redactar(valor: unknown): unknown {
  return redactarEn(valor, new WeakSet());
}

function redactarEn(valor: unknown, vistos: WeakSet<object>): unknown {
  if (typeof valor === "string") {
    return redactarTexto(valor);
  }
  if (typeof valor === "number" || typeof valor === "bigint") {
    const texto = String(valor);
    return redactarTexto(texto) === texto ? valor : REDACTADO;
  }
  if (typeof valor !== "object" || valor === null) {
    return valor;
  }
  if (vistos.has(valor)) {
    return "[circular]";
  }
  vistos.add(valor);
  if (Array.isArray(valor)) {
    return valor.map((elemento: unknown) => redactarEn(elemento, vistos));
  }
  // Sin prototipo: una clave `__proto__` queda como dato, no cambia el prototipo.
  const copia: Record<string, unknown> = Object.create(null);
  for (const [clave, interno] of Object.entries(valor)) {
    copia[redactarTexto(clave)] = esClaveSensible(clave)
      ? REDACTADO
      : redactarEn(interno, vistos);
  }
  return copia;
}

/** Los campos que la línea legible muestra aparte; el resto va en el JSON del final. */
const CAMPOS_PROPIOS = new Set(["time", "level", "referencia", "msg"]);

function dosDigitos(numero: number): string {
  return String(numero).padStart(2, "0");
}

/**
 * Una línea legible (sin salto final) a partir de un registro ya redactado:
 * `HH:MM:SS nivel [referencia] mensaje {resto en JSON}`. La hora es la local
 * de la máquina; `[referencia]` y el JSON del final aparecen solo si hay.
 */
export function formatearLegible(
  registro: Readonly<Record<string, unknown>>,
): string {
  const partes: string[] = [];
  const fecha = new Date(String(registro.time));
  partes.push(
    Number.isNaN(fecha.getTime())
      ? "--:--:--"
      : `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}:${dosDigitos(fecha.getSeconds())}`,
  );
  partes.push(String(registro.level));
  if (registro.referencia !== undefined) {
    partes.push(`[${String(registro.referencia)}]`);
  }
  if (registro.msg !== undefined) {
    partes.push(String(registro.msg));
  }
  const resto = Object.fromEntries(
    Object.entries(registro).filter(([clave]) => !CAMPOS_PROPIOS.has(clave)),
  );
  if (Object.keys(resto).length > 0) {
    partes.push(JSON.stringify(resto));
  }
  return partes.join(" ");
}

/** Relee la línea JSON que armó pino, la redacta y la escribe en el formato pedido. */
function reescribir(linea: string, formato: FormatoLog): string {
  const registro = redactar(JSON.parse(linea)) as Record<string, unknown>;
  return formato === "legible"
    ? `${formatearLegible(registro)}\n`
    : `${JSON.stringify(registro)}\n`;
}

/** Arma un log con el formato, el nivel y el destino dados. */
export function crearLog(opciones: OpcionesLog): Log {
  const { formato, nivel } = opciones;
  const destino = opciones.destino ?? pino.destination({ dest: 1, sync: true });
  const logger = pino(
    {
      level: nivel,
      base: null,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (etiqueta) => ({ level: etiqueta }),
      },
      mixin: () => {
        const referencia = almacenReferencia.getStore();
        return referencia === undefined ? {} : { referencia };
      },
      hooks: {
        streamWrite: (linea) => reescribir(linea, formato),
      },
    },
    destino,
  );
  // Pino 10.3.1 guarda los serializadores y los "stringifiers" en objetos con
  // prototipo y busca uno por cada clave logueada: con una clave como
  // `valueOf` o `toString` encuentra el método de `Object.prototype`, lo llama
  // y tira TypeError o escribe JSON roto (lo encontró la propiedad de emails
  // de tests/casos-uso/log.test.ts). Van los mismos, en objetos sin
  // prototipo; los hijos (`log.child`) los heredan.
  sinPrototipo(logger, pino.symbols.serializersSym);
  sinPrototipo(logger, pino.symbols.stringifiersSym);
  return logger;
}

function sinPrototipo(logger: Log, simbolo: symbol): void {
  const actual: unknown = Reflect.get(logger, simbolo);
  Reflect.set(logger, simbolo, Object.assign(Object.create(null), actual));
}

const esquemaLog = esquemaEntorno.pick({
  APP_ENTORNO: true,
  LOG_NIVEL: true,
});

/**
 * Formato y nivel según las variables de entorno. Si `APP_ENTORNO` o
 * `LOG_NIVEL` son inválidas, JSON e `info`: el log todavía tiene que poder
 * decir que el entorno es inválido, y el proceso no arranca igual
 * (`exigirEntornoValido`).
 */
export function opcionesDesdeEntorno(
  variables: Readonly<Record<string, string | undefined>>,
): Pick<OpcionesLog, "formato" | "nivel"> {
  const resultado = esquemaLog.safeParse(variables);
  if (!resultado.success) {
    return { formato: "json", nivel: "info" };
  }
  const { APP_ENTORNO, LOG_NIVEL } = resultado.data;
  const local = APP_ENTORNO === "local";
  return {
    formato: local ? "legible" : "json",
    nivel: LOG_NIVEL ?? (local ? "debug" : "info"),
  };
}

/** El log del proceso, con formato y nivel de su entorno. */
export const log: Log = crearLog(opcionesDesdeEntorno(process.env));
