/**
 * Doble en memoria del puerto `Auditoria` (F0-22): una lista viva solo
 * mientras dura el proceso. `registrados()` la deja inspeccionar (no está
 * en el puerto: es un agregado propio del doble, para los tests). El
 * adaptador de Prisma que lo persiste de verdad llega en F0-30.
 */
import type { RegistroAuditoria } from "../../dominio/compartido/auditable.ts";
import type { Auditoria } from "../../puertos/auditoria.ts";

/** Un `Auditoria` de prueba con `registrados()` para inspección. */
export function crearAuditoriaEnMemoria(): Auditoria & {
  /** Todos los registros guardados, en el orden en que se registraron. */
  registrados(): readonly RegistroAuditoria[];
} {
  const registros: RegistroAuditoria[] = [];

  return {
    registrar(registro) {
      registros.push(registro);
      return Promise.resolve();
    },
    registrados() {
      return [...registros];
    },
  };
}
