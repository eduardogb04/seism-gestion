/**
 * El flujo de sesión (F0-31, ADR 0027). Después de que el proveedor de
 * identidad verificó quién es (`Identidad.completarLogin`), acá se decide si
 * entra:
 *
 * - `completarSesion(identidad, agente)`: si el email (en minúsculas) no es un
 *   usuario **activo**, o el proveedor no lo verificó, rebota con `AUT-0001`
 *   **sin crear nada**. Si lo es, abre una sesión de 12 horas en `sesiones`
 *   (el token de 256 bits lo genera el repositorio, F0-30). La cookie la pone
 *   la app.
 * - `validarSesion(id)`: cada request valida la sesión **contra la base**
 *   —que exista, que no haya vencido y que su usuario siga activo—, con una
 *   caché en memoria de **30 s como máximo**, medidos con el reloj inyectado.
 *   Por eso revocar a alguien (que además borra sus sesiones) le corta la
 *   sesión activa a más tardar 30 s después. Si no valida, `AUT-0002`.
 * - `cerrarSesion(id)`: la quita de la base y de la caché.
 *
 * La caché es de este objeto: el punto de armado crea uno por proceso.
 */

import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import {
  ErrorSistema,
  nuevoError,
} from "../../dominio/compartido/errores/error-sistema.ts";
import type { Identificador } from "../../dominio/compartido/identificador.ts";
import {
  esAnterior,
  type FechaHora,
  type Reloj,
} from "../../dominio/compartido/reloj.ts";
import type { IdentidadVerificada } from "../../puertos/identidad.ts";
import type { Sesion } from "../../puertos/repositorios/sesiones.ts";
import type { Transaccional } from "../../puertos/repositorios/transaccion.ts";
import type { Rol, Usuario } from "../../puertos/repositorios/usuarios.ts";
import { milisegundosEntre, sumarSegundos } from "./tiempo.ts";

/** Cuánto dura una sesión desde que se abre (ADR 0027). */
export const DURACION_SESION_SEGUNDOS = 12 * 60 * 60;

/** Lo más que una validación puede venir de la caché sin volver a la base. */
export const CACHE_SESION_MS = 30_000;

/** Una sesión que validó, con quién es. Es lo que la app llama "la sesión actual". */
export type SesionValida = {
  readonly sesionId: string;
  readonly expiraEn: FechaHora;
  readonly usuario: {
    readonly id: Identificador<"Usuario">;
    readonly email: string;
    readonly nombre: string | null;
    readonly rol: Rol;
  };
};

export type DependenciasSesion = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
};

export type CasosUsoSesion = {
  /** Abre la sesión de un usuario activo, o `AUT-0001` sin crear nada. */
  completarSesion(
    identidad: IdentidadVerificada,
    agente: string | null,
  ): Promise<Sesion>;
  /** La sesión y su usuario, contra la base (caché ≤ 30 s), o `AUT-0002`. */
  validarSesion(id: string): Promise<SesionValida>;
  cerrarSesion(id: string): Promise<void>;
};

function estaActivo(usuario: Usuario | null): usuario is Usuario {
  return (
    usuario !== null &&
    usuario.valor.estado === "activo" &&
    usuario.eliminadoEn === undefined
  );
}

function sesionInvalida(motivo: string): ErrorSistema {
  return nuevoError(catalogo.AUT_0002, { motivo });
}

export function crearCasosUsoSesion({
  transaccional,
  reloj,
}: DependenciasSesion): CasosUsoSesion {
  const cache = new Map<
    string,
    { readonly valida: SesionValida; readonly consultadaEn: FechaHora }
  >();

  function vigente(consultadaEn: FechaHora, ahora: FechaHora): boolean {
    const transcurrido = milisegundosEntre(consultadaEn, ahora);
    return transcurrido >= 0 && transcurrido < CACHE_SESION_MS;
  }

  /** Saca de la caché lo que ya no se puede usar, para que no crezca sin tope. */
  function podar(ahora: FechaHora): void {
    for (const [id, entrada] of cache) {
      if (!vigente(entrada.consultadaEn, ahora)) {
        cache.delete(id);
      }
    }
  }

  function consultar(id: string, ahora: FechaHora): Promise<SesionValida> {
    return transaccional.ejecutar(async (repos) => {
      const sesion = await repos.sesiones.buscarPorId(id);
      if (sesion === null) {
        throw sesionInvalida("la sesión no existe");
      }
      if (!esAnterior(ahora, sesion.expiraEn)) {
        throw sesionInvalida("la sesión venció");
      }
      const usuario = await repos.usuarios.buscarPorId(sesion.usuarioId);
      if (!estaActivo(usuario)) {
        throw sesionInvalida("el usuario de la sesión ya no está activo");
      }
      return {
        sesionId: sesion.id,
        expiraEn: sesion.expiraEn,
        usuario: {
          id: usuario.valor.id,
          email: usuario.valor.email,
          nombre: usuario.valor.nombre,
          rol: usuario.valor.rol,
        },
      };
    });
  }

  return {
    async completarSesion(identidad, agente) {
      if (identidad.emailVerificado !== true) {
        throw nuevoError(catalogo.AUT_0001, {
          motivo: "el proveedor no verificó el email",
          proveedor: identidad.proveedor,
        });
      }
      const email = identidad.email.trim().toLowerCase();
      const ahora = reloj.ahora();
      return transaccional.ejecutar(async (repos) => {
        const usuario = await repos.usuarios.buscarPorEmail(email);
        if (!estaActivo(usuario)) {
          throw nuevoError(catalogo.AUT_0001, {
            motivo:
              usuario === null
                ? "el email no es un usuario"
                : "el usuario no está activo",
            proveedor: identidad.proveedor,
          });
        }
        return repos.sesiones.abrir({
          usuarioId: usuario.valor.id,
          creadaEn: ahora,
          expiraEn: sumarSegundos(ahora, DURACION_SESION_SEGUNDOS),
          agente,
        });
      });
    },

    async validarSesion(id) {
      const ahora = reloj.ahora();
      const enCache = cache.get(id);
      if (enCache !== undefined && vigente(enCache.consultadaEn, ahora)) {
        if (!esAnterior(ahora, enCache.valida.expiraEn)) {
          cache.delete(id);
          throw sesionInvalida("la sesión venció");
        }
        return enCache.valida;
      }
      cache.delete(id);
      const valida = await consultar(id, ahora);
      podar(ahora);
      cache.set(id, { valida, consultadaEn: ahora });
      return valida;
    },

    async cerrarSesion(id) {
      cache.delete(id);
      await transaccional.ejecutar((repos) => repos.sesiones.cerrar(id));
    },
  };
}

/**
 * La sesión actual a partir del valor de la cookie: `null` si no hay cookie o
 * si no valida (`AUT-0002`). Cualquier otro error sigue de largo: una base
 * caída no es "no hay sesión". Es el helper del lado del servidor que la app
 * (y la protección del panel, F0-32) usa para saber quién está.
 */
export async function sesionDesdeCookie(
  valor: string | undefined,
  casos: Pick<CasosUsoSesion, "validarSesion">,
): Promise<SesionValida | null> {
  if (valor === undefined || valor === "") {
    return null;
  }
  try {
    return await casos.validarSesion(valor);
  } catch (error) {
    if (error instanceof ErrorSistema && error.codigo === "AUT-0002") {
      return null;
    }
    throw error;
  }
}
