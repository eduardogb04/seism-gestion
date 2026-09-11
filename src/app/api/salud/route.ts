/**
 * `GET /api/salud` (F0-04, P13): el latido público que usa el deploy.
 * Devuelve solo `{ ok: true, version }`, sin autenticación y sin detalle
 * (el panel `/salud` con detalle es otra cosa y exige rol desde el lote 8).
 *
 * `process.env.APP_VERSION` no se lee del entorno al ejecutar: Next lo
 * reemplaza por su valor literal al compilar (`next.config.ts`, opción
 * `env`), y `next.config.ts` no deja compilar sin versión (ADR 0005). Si
 * igual faltara (código que no compiló Next con esa configuración), el latido
 * no miente: responde 500 con `ok: false`.
 */

const VERSION = process.env.APP_VERSION;

export function GET(): Response {
  if (VERSION === undefined) {
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true, version: VERSION });
}
