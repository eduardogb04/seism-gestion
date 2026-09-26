/**
 * `Auditable<T>` y `RegistroAuditoria` (F0-22, DISENO): *"borrado lógico y
 * auditoría de cambios"*. `Auditable<T>` envuelve cualquier valor con quién
 * lo creó, quién lo cambió por última vez y, si lo borraron,
 * cuándo y quién: `marcarEliminado` es la **única** forma de "borrar" —
 * ningún puerto de repositorio declara un `eliminar` físico (probado en
 * `tests/dominio/puertos-sin-borrado.test.ts`). `RegistroAuditoria` es el
 * tipo de una entrada del historial de auditoría (F0-30 la persiste).
 *
 * Funciones puras e inmutables: reciben el `Actor` y el `Reloj` de F0-18 (el
 * dominio nunca consulta la fecha del sistema), y nunca mutan lo que
 * reciben — siempre devuelven un valor nuevo, congelado.
 */
import type { Actor } from "./actor.ts";
import { catalogo } from "./errores/catalogo.ts";
import type { Resultado } from "./historial.ts";
import type { Identificador } from "./identificador.ts";
import type { FechaHora, Reloj } from "./reloj.ts";

/** Envoltorio de auditoría: quién creó `valor`, quién lo cambió, y si lo borraron. */
export interface Auditable<T> {
  readonly valor: T;
  readonly creadoEn: FechaHora;
  readonly creadoPor: Actor;
  readonly actualizadoEn: FechaHora;
  readonly actualizadoPor: Actor;
  readonly eliminadoEn?: FechaHora;
  readonly eliminadoPor?: Actor;
}

/** Se intentó actualizar o volver a eliminar un `Auditable` ya eliminado. */
export interface AuditableYaEliminado {
  readonly codigo: typeof catalogo.DOM_0007.codigo;
}

/** Envuelve `valor` recién creado: creado y actualizado son el mismo instante y el mismo actor. */
export function crearAuditable<T>(
  valor: T,
  actor: Actor,
  reloj: Reloj,
): Auditable<T> {
  const ahora = reloj.ahora();
  return Object.freeze({
    valor,
    creadoEn: ahora,
    creadoPor: actor,
    actualizadoEn: ahora,
    actualizadoPor: actor,
  });
}

/**
 * Reemplaza el valor y anota quién y cuándo, conservando quién creó. Rechaza
 * con `AuditableYaEliminado` si `auditable` ya está borrado: no se actualiza
 * lo que ya no existe lógicamente. No lanza.
 */
export function marcarActualizado<T>(
  auditable: Auditable<T>,
  nuevoValor: T,
  actor: Actor,
  reloj: Reloj,
): Resultado<Auditable<T>, AuditableYaEliminado> {
  if (auditable.eliminadoEn !== undefined) {
    return { ok: false, error: { codigo: catalogo.DOM_0007.codigo } };
  }
  return {
    ok: true,
    valor: Object.freeze({
      ...auditable,
      valor: nuevoValor,
      actualizadoEn: reloj.ahora(),
      actualizadoPor: actor,
    }),
  };
}

/**
 * La única forma de "borrar": anota cuándo y quién, sin tocar `valor`. Sobre
 * un `Auditable` ya eliminado, rechaza con `AuditableYaEliminado` en vez de
 * volver a marcarlo. No lanza: no existe un `eliminar` físico en el dominio.
 */
export function marcarEliminado<T>(
  auditable: Auditable<T>,
  actor: Actor,
  reloj: Reloj,
): Resultado<Auditable<T>, AuditableYaEliminado> {
  if (auditable.eliminadoEn !== undefined) {
    return { ok: false, error: { codigo: catalogo.DOM_0007.codigo } };
  }
  return {
    ok: true,
    valor: Object.freeze({
      ...auditable,
      eliminadoEn: reloj.ahora(),
      eliminadoPor: actor,
    }),
  };
}

/** Las acciones que un `RegistroAuditoria` puede describir. */
export type AccionAuditoria = "crear" | "actualizar" | "eliminar";

/**
 * Una entrada del historial de auditoría: qué cambió, quién y cuándo.
 * `entidad` nombra el tipo de la fila (`"Servicio"`, `"Usuario"`...), `id`
 * su identificador. La invariante la hace cumplir `crearRegistroAuditoria`:
 * `crear` nunca lleva `antes`, y `eliminar` lleva en `despues` el registro
 * con su borrado lógico (`eliminadoEn` presente): acá tampoco hay borrado
 * físico.
 */
export interface RegistroAuditoria {
  readonly entidad: string;
  readonly id: Identificador<string>;
  readonly accion: AccionAuditoria;
  readonly antes: Readonly<Record<string, unknown>> | null;
  readonly despues: Readonly<Record<string, unknown>> | null;
  readonly actor: Actor;
  readonly en: FechaHora;
}

/** Los datos de un `RegistroAuditoria`, antes de validar la invariante. */
export type DatosRegistroAuditoria = RegistroAuditoria;

/**
 * Arma un `RegistroAuditoria` validando su invariante, o dice por qué no
 * puede: `entidad` no vacía; `accion: "crear"` exige `antes: null`;
 * `accion: "eliminar"` exige un `despues` que no sea `null` y que ya lleve
 * `eliminadoEn` (el borrado es lógico, nunca físico).
 */
export function crearRegistroAuditoria(
  datos: DatosRegistroAuditoria,
): Resultado<RegistroAuditoria, string> {
  if (datos.entidad.trim().length === 0) {
    return {
      ok: false,
      error: "la entidad de un registro de auditoría no puede estar vacía.",
    };
  }
  if (datos.accion === "crear" && datos.antes !== null) {
    return {
      ok: false,
      error:
        'un registro de auditoría de "crear" no puede traer un "antes": no existía nada previo.',
    };
  }
  if (datos.accion === "eliminar") {
    if (datos.despues === null || !("eliminadoEn" in datos.despues)) {
      return {
        ok: false,
        error:
          'un registro de auditoría de "eliminar" tiene que traer en "despues" el registro con su borrado lógico (con "eliminadoEn"): acá tampoco hay borrado físico.',
      };
    }
  }
  return {
    ok: true,
    valor: Object.freeze({ ...datos }),
  };
}
