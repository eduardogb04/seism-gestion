"use server";

/**
 * Las tres acciones de escritura de `/administracion/usuarios` (F0-32,
 * ADR 0028). Cualquiera puede armar el POST a mano, así que cada una:
 *
 * 1. toma el `Actor` **solo** de la sesión validada (`conActorDeSesion`): un
 *    campo del formulario nunca dice quién actúa;
 * 2. valida con Zod lo que llega (`formularios.ts`, `AUT-0008`);
 * 3. deja que el caso de uso decida si esa persona puede (`AUT-0003`): ocultar
 *    un botón no protege nada.
 *
 * Termina siempre en una redirección a la lista, con `?error=<código>` si un
 * caso de uso o la validación la rechazó. Sin sesión, a `AUT-0002`.
 */

import { redirect } from "next/navigation.js";
import {
  datosDeAlta,
  datosDeCambioDeRol,
  datosDeUsuario,
} from "../../../casos-uso/usuarios/formularios.ts";
import type { Actor } from "../../../dominio/compartido/actor.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { conActorDeSesion } from "../../(auth)/sesion-actual.ts";

const LISTA = "/administracion/usuarios";

async function ejecutar(
  trabajo: (actor: Actor) => Promise<unknown>,
): Promise<never> {
  const resultado = await conActorDeSesion(trabajo);
  redirect(
    resultado.ok
      ? LISTA
      : `${LISTA}?${new URLSearchParams({ error: resultado.codigo })}`,
  );
}

export async function altaDeUsuario(formulario: FormData): Promise<never> {
  return ejecutar((actor) => {
    const { email, rol } = datosDeAlta({
      email: formulario.get("email"),
      rol: formulario.get("rol"),
    });
    return armado().usuarios.darDeAlta(actor, email, rol);
  });
}

export async function revocarUsuario(formulario: FormData): Promise<never> {
  return ejecutar((actor) => {
    const usuarioId = datosDeUsuario({
      usuarioId: formulario.get("usuarioId"),
    });
    return armado().usuarios.revocar(actor, usuarioId);
  });
}

export async function cambiarRolDeUsuario(
  formulario: FormData,
): Promise<never> {
  return ejecutar((actor) => {
    const { usuarioId, rol } = datosDeCambioDeRol({
      usuarioId: formulario.get("usuarioId"),
      rol: formulario.get("rol"),
    });
    return armado().usuarios.cambiarRol(actor, usuarioId, rol);
  });
}
