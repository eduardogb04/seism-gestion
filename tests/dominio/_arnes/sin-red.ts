/**
 * El arnés del nivel **dominio** (F0-14): un test de dominio no abre la red ni
 * toca la base. Acá eso deja de ser una convención y pasa a ser mecánico: este
 * archivo lo carga Vitest antes de cada archivo de test del proyecto
 * `dominio` (`setupFiles` en `vitest.config.ts`) y reemplaza las dos puertas
 * de salida del proceso:
 *
 * - `Socket.prototype.connect` (`node:net`): por ahí salen **todas** las
 *   conexiones TCP de Node — `pg`, Prisma, un cliente HTTP, `undici`.
 * - `globalThis.fetch`: se corta antes, así el error dice lo que pasó en vez
 *   de llegar envuelto en un `TypeError: fetch failed`.
 *
 * No se guarda la implementación original ni se restaura: el proceso de
 * trabajo de Vitest existe para correr tests de dominio y nada más. El test
 * que lo comprueba —uno que intenta abrir un socket y espera este error— es
 * `tests/dominio/_arnes/sin-red.test.ts`.
 *
 * Los niveles que sí necesitan una base (casos de uso) o un servidor de
 * verdad (e2e) son otros proyectos, sin este arnés.
 */

import { Socket } from "node:net";

/** Lo que ve quien escribió un test de dominio que intenta salir a la red. */
export const MENSAJE_SIN_RED =
  "nivel dominio: sin red ni base. Un test de dominio no abre sockets ni pide HTTP; si lo necesita, va en tests/casos-uso/ (AGENTS.md, sección Testing).";

/** El error con que el arnés corta cualquier salida a la red. */
export class ErrorSinRed extends Error {
  constructor() {
    super(MENSAJE_SIN_RED);
    this.name = "ErrorSinRed";
  }
}

Socket.prototype.connect = function conectar(): never {
  throw new ErrorSinRed();
};

globalThis.fetch = function pedir(): Promise<never> {
  return Promise.reject(new ErrorSinRed());
};
