"use server";

/**
 * Las acciones de la pantalla de pagos de un egreso (F2-09). El `Actor` sale
 * de la sesión y si esa persona puede escribir lo decide el caso de uso. Si
 * pasó, vuelven a la pantalla del egreso (que se dibuja de nuevo con el saldo);
 * si no, devuelven el estado del formulario: lo escrito y el mensaje de cada
 * campo, o el error con su código. Ninguna lanza un error del catálogo.
 */

import { redirect } from "next/navigation.js";
import type { Escrito } from "../../casos-uso/abm/definicion.ts";
import { pantallaDeCodigo } from "../../casos-uso/sesion/errores.ts";
import { armado } from "../../infraestructura/arranque/armado.ts";
import type { EstadoFormulario } from "../_ui/formulario-abm.tsx";
import { conActorDeSesion } from "../(auth)/sesion-actual.ts";

/** Los campos del formulario, tal cual se escribieron. Lo que agrega React (`$ACTION_...`) no es de la persona. */
function escritoEn(formulario: FormData): Escrito {
  const escrito: Record<string, string> = {};
  for (const [nombre, valor] of formulario) {
    if (typeof valor === "string" && !nombre.startsWith("$ACTION_")) {
      escrito[nombre] = valor;
    }
  }
  return escrito;
}

export async function registrarPagoDeEgreso(
  egresoId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const escrito = escritoEn(formulario);
  const resultado = await conActorDeSesion((actor) =>
    armado().pagos.registrarPago(actor, egresoId, escrito),
  );
  if (!resultado.ok) {
    return { escrito, errores: {}, error: pantallaDeCodigo(resultado.codigo) };
  }
  if (!resultado.valor.ok) {
    return { escrito, errores: resultado.valor.errores };
  }
  redirect(`/egresos/${egresoId}`);
}

/** La anulación, ya confirmada. */
export async function anularPagoDeEgreso(
  egresoId: string,
  pagoId: string,
  _previo: EstadoFormulario,
): Promise<EstadoFormulario> {
  const resultado = await conActorDeSesion((actor) =>
    armado().pagos.marcarPagoAnulado(actor, pagoId),
  );
  if (!resultado.ok) {
    return {
      escrito: {},
      errores: {},
      error: pantallaDeCodigo(resultado.codigo),
    };
  }
  redirect(`/egresos/${egresoId}`);
}
