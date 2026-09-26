/**
 * Repositorio de usuarios (F0-30, ADR 0024): la lista blanca de P4. Solo
 * entra al sistema quien tiene un usuario `activo`. Un usuario **nunca se
 * borra**: revocarlo es `estado: "revocado"` y no hay método de borrado
 * (regla 16 de `AGENTS.md`, `tests/dominio/puertos-sin-borrado.test.ts`).
 *
 * El `email` se guarda siempre en minúsculas: el adaptador lo normaliza al
 * escribir y al buscar, y la base lo exige (índice único y un CHECK). Así
 * `A@ejemplo.test` y `a@ejemplo.test` son el mismo usuario.
 *
 * Implementado con Prisma en `src/adaptadores/prisma/usuarios.ts`.
 */
import type { Auditable } from "../../dominio/compartido/auditable.ts";
import type { Identificador } from "../../dominio/compartido/identificador.ts";

/** `administrador` gestiona usuarios; `operador` usa el sistema. */
export type Rol = "administrador" | "operador";

/** `revocado` no entra: su email deja de estar en la lista blanca. */
export type EstadoUsuario = "activo" | "revocado";

/** Los datos de un usuario, sin la auditoría. */
export type DatosUsuario = {
  readonly id: Identificador<"Usuario">;
  /** En minúsculas. */
  readonly email: string;
  /** Se completa al primer ingreso (F0-31); el alta solo pide email y rol. */
  readonly nombre: string | null;
  readonly rol: Rol;
  readonly estado: EstadoUsuario;
};

/** Un usuario con quién y cuándo lo creó y lo cambió por última vez. */
export type Usuario = Auditable<DatosUsuario>;

export type RepositorioUsuarios = {
  buscarPorId(id: Identificador<"Usuario">): Promise<Usuario | null>;
  /** Busca sin distinguir mayúsculas. */
  buscarPorEmail(email: string): Promise<Usuario | null>;
  /**
   * Guarda un usuario nuevo. Si ya hay uno con ese email (sin distinguir
   * mayúsculas), lanza `AUT-0005` y no guarda nada.
   */
  crear(usuario: Usuario): Promise<void>;
  /** Reemplaza los datos y la auditoría de un usuario que ya existe. */
  actualizar(usuario: Usuario): Promise<void>;
  /**
   * Los administradores activos, **bloqueados** hasta que termine la
   * transacción en curso: dos cambios simultáneos no pueden dejar el sistema
   * sin administradores (ADR 0024).
   */
  bloquearAdministradoresActivos(): Promise<
    readonly Identificador<"Usuario">[]
  >;
};
