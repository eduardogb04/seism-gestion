"use server";

/**
 * Las acciones de la pantalla de un grupo (F3-09). El `Actor` sale de la
 * sesión y si esa persona puede escribir lo decide el caso de uso. Si pasó,
 * vuelven a la pantalla del grupo; si no, devuelven el estado del formulario
 * con lo escrito y el mensaje, o el error con su código. Agregar uno que ya
 * tiene otro grupo no escribe: vuelve a la pantalla pidiendo la confirmación
 * (`?mover=<cliente>`).
 */

import { redirect } from "next/navigation.js";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import type { EstadoFormulario } from "../../_ui/formulario-abm.tsx";
import { conActorDeSesion } from "../../(auth)/sesion-actual.ts";
import { escritoEn } from "../_abm/escrito.ts";

export async function agregarClienteAlGrupo(
  grupoId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const escrito = escritoEn(formulario);
  const clienteId = escrito.clienteId ?? "";
  if (clienteId === "") {
    return {
      escrito,
      errores: { clienteId: "Elegí el cliente que querés agregar." },
    };
  }
  const resultado = await conActorDeSesion((actor) =>
    armado().clientesDeGrupo.agregarClienteAGrupo(
      actor,
      grupoId,
      clienteId,
      false,
    ),
  );
  if (!resultado.ok) {
    return { escrito, errores: {}, error: pantallaDeCodigo(resultado.codigo) };
  }
  redirect(
    resultado.valor.ok
      ? `/catalogo/grupos/${grupoId}`
      : `/catalogo/grupos/${grupoId}?mover=${clienteId}`,
  );
}

/** El movimiento, ya confirmado. */
export async function moverClienteAlGrupo(
  grupoId: string,
  clienteId: string,
  _previo: EstadoFormulario,
): Promise<EstadoFormulario> {
  const resultado = await conActorDeSesion((actor) =>
    armado().clientesDeGrupo.agregarClienteAGrupo(
      actor,
      grupoId,
      clienteId,
      true,
    ),
  );
  if (!resultado.ok) {
    return {
      escrito: {},
      errores: {},
      error: pantallaDeCodigo(resultado.codigo),
    };
  }
  redirect(`/catalogo/grupos/${grupoId}`);
}

/** El retiro, ya confirmado. */
export async function sacarClienteDelGrupo(
  grupoId: string,
  clienteId: string,
  _previo: EstadoFormulario,
): Promise<EstadoFormulario> {
  const resultado = await conActorDeSesion((actor) =>
    armado().clientesDeGrupo.sacarClienteDeGrupo(actor, grupoId, clienteId),
  );
  if (!resultado.ok) {
    return {
      escrito: {},
      errores: {},
      error: pantallaDeCodigo(resultado.codigo),
    };
  }
  redirect(`/catalogo/grupos/${grupoId}`);
}
