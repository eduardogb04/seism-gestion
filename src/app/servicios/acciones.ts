"use server";

/**
 * Las acciones de escritura de Servicios (F2-04, ADR 0033). El `Actor` sale
 * solo de la sesión, y si esa persona puede escribir lo decide el caso de uso.
 *
 * Las del formulario (alta, edición, baja) devuelven su estado, como las del
 * molde de ABM. El cambio de estado y los sitios son formularios sin
 * JavaScript: si el caso de uso los rechaza, vuelven a la pantalla del servicio
 * con el código del error en la URL.
 */

import { redirect } from "next/navigation.js";
import type { ErroresPorCampo } from "../../casos-uso/abm/abm.ts";
import { pantallaDeCodigo } from "../../casos-uso/sesion/errores.ts";
import type { Actor } from "../../dominio/compartido/actor.ts";
import { armado } from "../../infraestructura/arranque/armado.ts";
import type { EstadoFormulario } from "../_ui/formulario-abm.tsx";
import { conActorDeSesion } from "../(auth)/sesion-actual.ts";
import { escritoEn } from "../catalogo/_abm/escrito.ts";

const RUTA = "/servicios";

type Escritura =
  | { readonly ok: true; readonly ruta: string }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

async function escribir(
  formulario: FormData,
  trabajo: (actor: Actor) => Promise<Escritura>,
): Promise<EstadoFormulario> {
  const escrito = escritoEn(formulario);
  const resultado = await conActorDeSesion(trabajo);
  if (!resultado.ok) {
    return { escrito, errores: {}, error: pantallaDeCodigo(resultado.codigo) };
  }
  if (!resultado.valor.ok) {
    return { escrito, errores: resultado.valor.errores };
  }
  redirect(resultado.valor.ruta);
}

/** El alta lleva a la pantalla del servicio nuevo: ahí se marcan sus sitios. */
export async function crearServicio(
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const creado = await armado().servicios.crear(actor, escritoEn(formulario));
    return creado.ok ? { ok: true, ruta: `${RUTA}/${creado.id}` } : creado;
  });
}

export async function guardarServicio(
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const guardado = await armado().servicios.guardar(
      actor,
      id,
      escritoEn(formulario),
    );
    return guardado.ok ? { ok: true, ruta: `${RUTA}/${id}` } : guardado;
  });
}

/** La baja, ya confirmada. */
export async function darDeBajaServicio(
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    await armado().servicios.marcarEliminado(actor, id);
    return { ok: true, ruta: RUTA };
  });
}

async function enElServicio(
  id: string,
  trabajo: (actor: Actor) => Promise<void>,
): Promise<never> {
  const resultado = await conActorDeSesion(trabajo);
  const ruta = `${RUTA}/${encodeURIComponent(id)}`;
  redirect(resultado.ok ? ruta : `${ruta}?error=${resultado.codigo}`);
}

/** El estado al que pasa es el `value` del botón que se apretó. */
export async function cambiarEstadoDeServicio(
  id: string,
  formulario: FormData,
): Promise<void> {
  const { a = "", nota = "" } = escritoEn(formulario);
  return enElServicio(id, (actor) =>
    armado().servicios.cambiarEstado(actor, id, a, nota),
  );
}

export async function guardarSitiosDeServicio(
  id: string,
  formulario: FormData,
): Promise<void> {
  const sitioIds = formulario
    .getAll("sitio")
    .filter((valor) => typeof valor === "string");
  return enElServicio(id, (actor) =>
    armado().servicios.guardarSitios(actor, id, sitioIds),
  );
}
