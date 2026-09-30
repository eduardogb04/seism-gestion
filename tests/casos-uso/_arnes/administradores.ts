/**
 * Lo que comparten los tests de avisos al administrador (M-05): usuarios
 * sembrados en la base real. Datos inventados.
 */

import type { crearClientePrisma } from "../../../src/adaptadores/prisma/cliente.ts";
import { crearRepositorioUsuariosPrisma } from "../../../src/adaptadores/prisma/usuarios.ts";
import {
  type Actor,
  crearNombreProceso,
} from "../../../src/dominio/compartido/actor.ts";
import { crearAuditable } from "../../../src/dominio/compartido/auditable.ts";
import {
  type Identificador,
  identificadorDesde,
} from "../../../src/dominio/compartido/identificador.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../../src/dominio/compartido/reloj.ts";
import type {
  EstadoUsuario,
  Rol,
} from "../../../src/puertos/repositorios/usuarios.ts";

export type UsuarioSembrado = {
  readonly id: Identificador<"Usuario">;
  readonly email: string;
};

export type DatosSembrado = {
  readonly email: string;
  readonly rol: Rol;
  readonly estado: EstadoUsuario;
};

/** Datos de un usuario inventado. */
export const ADMIN_UNO = {
  email: "admin.uno@ejemplo.test",
  rol: "administrador",
  estado: "activo",
} as const;
/** Datos de un usuario inventado. */
export const ADMIN_DOS = {
  email: "admin.dos@ejemplo.test",
  rol: "administrador",
  estado: "activo",
} as const;
/** Datos de un usuario inventado. */
export const OPERADOR = {
  email: "operador@ejemplo.test",
  rol: "operador",
  estado: "activo",
} as const;
/** Datos de un usuario inventado. */
export const EX_ADMIN = {
  email: "ex.admin@ejemplo.test",
  rol: "administrador",
  estado: "revocado",
} as const;

function procesoDeSiembra(): Actor {
  const nombre = crearNombreProceso("siembra-de-prueba");
  if (!nombre.ok) {
    throw new Error(nombre.error);
  }
  return { tipo: "sistema", proceso: nombre.valor };
}

function relojDeSiembra() {
  const fecha = crearFechaHora({
    anio: 2031,
    mes: 3,
    dia: 3,
    hora: 9,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!fecha.ok) {
    throw new Error(fecha.mensaje);
  }
  return RelojFijo(fecha.fechaHora);
}

/** Crea los usuarios en la base, en orden, y devuelve sus ids. */
export async function sembrarUsuarios(
  prisma: ReturnType<typeof crearClientePrisma>,
  datos: readonly DatosSembrado[],
): Promise<readonly UsuarioSembrado[]> {
  const repositorio = crearRepositorioUsuariosPrisma(prisma);
  const sembrados: UsuarioSembrado[] = [];
  for (const [indice, dato] of datos.entries()) {
    const id = identificadorDesde<"Usuario">(
      `00000000-0000-4000-8000-${String(indice + 1).padStart(12, "0")}`,
    );
    await repositorio.crear(
      procesoDeSiembra(),
      crearAuditable(
        {
          id,
          email: dato.email,
          nombre: null,
          rol: dato.rol,
          estado: dato.estado,
        },
        procesoDeSiembra(),
        relojDeSiembra(),
      ),
    );
    sembrados.push({ id, email: dato.email });
  }
  return sembrados;
}
