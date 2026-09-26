/**
 * Repositorio de sesiones (F0-30, ADR 0024): las sesiones abiertas viven en
 * Postgres (P4). El `id` **es** el token que lleva la cookie: 256 bits
 * aleatorios en base64url (43 caracteres) que genera el adaptador, nunca un
 * UUID ni algo derivable.
 *
 * Una sesión no es un dato de negocio: es una credencial. Cerrarla la quita
 * de verdad (`cerrarTodasDe`), porque una credencial que "sigue guardada pero
 * marcada" es una credencial que alguien puede volver a usar por error. Por
 * eso el método no se llama `eliminar`: la regla 16 de `AGENTS.md` (sin
 * borrado físico) es para los datos de negocio, y la excepción está
 * justificada en el ADR 0024.
 *
 * Implementado con Prisma en `src/adaptadores/prisma/sesiones.ts`.
 */
import type { Identificador } from "../../dominio/compartido/identificador.ts";
import type { FechaHora } from "../../dominio/compartido/reloj.ts";

export type Sesion = {
  /** El token: 256 bits aleatorios en base64url. */
  readonly id: string;
  readonly usuarioId: Identificador<"Usuario">;
  readonly creadaEn: FechaHora;
  readonly expiraEn: FechaHora;
  readonly ultimoUso: FechaHora;
  /** El agente de usuario del navegador, si vino. */
  readonly agente: string | null;
};

/** Lo que hace falta para abrir una sesión: el `id` lo genera el repositorio. */
export type DatosSesionNueva = Omit<Sesion, "id" | "ultimoUso">;

export type RepositorioSesiones = {
  /** Abre una sesión nueva con un token recién generado. `ultimoUso` arranca en `creadaEn`. */
  abrir(datos: DatosSesionNueva): Promise<Sesion>;
  buscarPorId(id: string): Promise<Sesion | null>;
  /** Cierra todas las sesiones del usuario y dice cuántas cerró. */
  cerrarTodasDe(usuarioId: Identificador<"Usuario">): Promise<number>;
};
