/**
 * Puerto de una sonda de integración (F0-25): cómo sabe `listarSalud`
 * (`src/casos-uso/salud/listar-salud.ts`) si una integración responde. Hoy
 * hay una sola, `base` (`SELECT 1`, `src/adaptadores/prisma/sonda-base.ts`);
 * almacén, correo e IA suman la suya cuando existan.
 */

export type SondaIntegracion = {
  /** El nombre que ve el panel de salud (`base`, `almacen`...). */
  readonly nombre: string;
  /** Resuelve si la integración responde; rechaza si no. */
  probar(): Promise<void>;
};
