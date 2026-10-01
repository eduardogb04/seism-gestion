/**
 * El punto de armado de los avisos al administrador (M-05, ADR 0030): los dos
 * avisos de Fase 0 —el fallido que agotó sus reintentos (`INF-0002`, F0-25) y
 * el tope de gasto de IA (`IA-0001`, F0-28)— salen por el puerto
 * `Notificaciones`, **uno por cada administrador activo**.
 *
 * - `crearAvisarAdministradores`: lee los administradores activos de
 *   `RepositorioUsuarios` y le manda a cada uno el aviso con `enviar`. **Nunca
 *   lanza**: un aviso que falla no tapa la operación que lo originó. Cada
 *   falla (`enviar` que lanza o que rechaza el mensaje, o la lectura de
 *   usuarios) se loguea con su código y, si fue la de un destinatario, sigue
 *   con el resto. Con cero administradores activos no envía nada y escribe un
 *   `warn` con el código del aviso.
 * - `crearAvisosIa`: adapta esa función al `AvisosIa` que recibe `interpretar`,
 *   para que el caso de uso no importe infraestructura.
 * - `armarAvisos`: el armado de Fase 0, con el adaptador `notificaciones-por-log`
 *   (no hay canal real hasta la Fase 1).
 */

import { crearNotificacionesPorLog } from "../../adaptadores/log/notificaciones.ts";
import type { ErrorSistema } from "../../dominio/compartido/errores/error-sistema.ts";
import type { AvisosIa } from "../../puertos/ia.ts";
import type { Notificaciones } from "../../puertos/notificaciones.ts";
import type { RepositorioUsuarios } from "../../puertos/repositorios/usuarios.ts";
import { registrarFalla } from "../fallas.ts";
import type { Log } from "../log.ts";

/** Lo que se le cuenta al administrador: el código del aviso se suma solo. */
export type MensajeAviso = {
  readonly titulo: string;
  readonly cuerpo: string;
};

/** Avisa a todos los administradores activos. No lanza nunca. */
export type Avisar = (codigo: string, mensaje: MensajeAviso) => Promise<void>;

export type DependenciasAvisar = {
  readonly notificaciones: Notificaciones;
  readonly usuarios: Pick<RepositorioUsuarios, "listar">;
  readonly log: Log;
};

/** El aviso de un error del catálogo: su descripción y los detalles del caso. */
export function mensajeDeError(error: ErrorSistema): MensajeAviso {
  const detalles = Object.entries(error.detalles)
    .map(([clave, valor]) => `${clave}: ${String(valor)}`)
    .join(", ");
  return { titulo: error.entrada.descripcion, cuerpo: detalles };
}

export function crearAvisarAdministradores(
  dependencias: DependenciasAvisar,
): Avisar {
  const { notificaciones, usuarios, log } = dependencias;

  return async (codigo, mensaje) => {
    let todos: Awaited<ReturnType<typeof usuarios.listar>>;
    try {
      todos = await usuarios.listar();
    } catch (causa) {
      registrarFalla(log, causa, { aviso: codigo, al: "leer administradores" });
      return;
    }

    const administradores = todos.filter(
      ({ valor }) => valor.rol === "administrador" && valor.estado === "activo",
    );
    if (administradores.length === 0) {
      log.warn(
        { codigo },
        "aviso sin administradores activos a quién mandárselo",
      );
      return;
    }

    for (const { valor } of administradores) {
      try {
        const resultado = await notificaciones.enviar(
          { tipo: "persona", usuarioId: valor.id },
          {
            titulo: `${codigo} · ${mensaje.titulo}`,
            cuerpo: mensaje.cuerpo,
            referencia: codigo,
          },
        );
        if (!resultado.ok) {
          log.error(
            {
              codigo: resultado.error.codigo,
              aviso: codigo,
              destinatario: valor.id,
              campo: resultado.error.campo,
            },
            "el canal rechazó el aviso al administrador",
          );
        }
      } catch (causa) {
        registrarFalla(log, causa, { aviso: codigo, destinatario: valor.id });
      }
    }
  };
}

export function crearAvisosIa(avisar: Avisar): AvisosIa {
  return {
    topeSuperado: (error) => avisar(error.codigo, mensajeDeError(error)),
  };
}

export type ArmadoAvisos = {
  readonly avisar: Avisar;
  readonly avisosIa: AvisosIa;
};

export function armarAvisos(dependencias: {
  readonly usuarios: Pick<RepositorioUsuarios, "listar">;
  readonly log: Log;
}): ArmadoAvisos {
  const avisar = crearAvisarAdministradores({
    notificaciones: crearNotificacionesPorLog(dependencias.log),
    usuarios: dependencias.usuarios,
    log: dependencias.log,
  });
  return { avisar, avisosIa: crearAvisosIa(avisar) };
}
