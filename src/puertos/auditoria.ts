/**
 * Puerto de auditoría (F0-22): dónde queda cada `RegistroAuditoria`
 * (`src/dominio/compartido/auditable.ts`). Implementado en memoria en Fase
 * 0 (`src/adaptadores/memoria/auditoria.ts`, para tests e inspección); el
 * adaptador de Prisma que lo persiste de verdad llega en F0-30.
 */
import type { RegistroAuditoria } from "../dominio/compartido/auditable.ts";

export type Auditoria = {
  /** Suma un registro al historial de auditoría. No hay `eliminar`: el historial solo crece. */
  registrar(registro: RegistroAuditoria): Promise<void>;
};
