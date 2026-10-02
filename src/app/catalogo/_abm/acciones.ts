"use server";

/**
 * Las acciones de escritura de todos los ABM (F1-03, ADR 0031). Las pantallas
 * del molde les atan el nombre de la entidad (y el id): llegan de afuera. El
 * `Actor` sale solo de la sesión, y si esa persona puede escribir lo decide el
 * caso de uso.
 *
 * Si pasó, redirigen al listado, con la búsqueda, el orden y la página que
 * tenía (`vuelta`, lo que va después del `?`: cambia los parámetros del
 * listado, nunca a dónde se va). Si no, devuelven el estado del formulario: lo
 * que la persona escribió y el mensaje de cada campo, o el error con su código
 * (también una entidad o un id que no existen: `DOM-0009`). Ninguna lanza un
 * error del catálogo.
 */

import { redirect } from "next/navigation.js";
import type { ErroresPorCampo } from "../../../casos-uso/abm/abm.ts";
import type {
  DefinicionAbm,
  Escrito,
} from "../../../casos-uso/abm/definicion.ts";
import { conDefinicion } from "../../../casos-uso/abm/definiciones.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import type { Actor } from "../../../dominio/compartido/actor.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import type { EntidadAbm } from "../../../puertos/repositorios/abm.ts";
import type { EstadoFormulario } from "../../_ui/formulario-abm.tsx";
import { conActorDeSesion } from "../../(auth)/sesion-actual.ts";
import { escritoEn } from "./escrito.ts";

type Escritura =
  | { readonly ok: true }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

async function escribir(
  entidad: string,
  vuelta: string,
  formulario: FormData,
  trabajo: <E extends EntidadAbm>(
    actor: Actor,
    definicion: DefinicionAbm<E>,
    escrito: Escrito,
  ) => Promise<Escritura>,
): Promise<EstadoFormulario> {
  const escrito = escritoEn(formulario);
  const resultado = await conActorDeSesion((actor) =>
    conDefinicion(entidad, async (definicion) => {
      const escritura = await trabajo(actor, definicion, escrito);
      return escritura.ok
        ? { ruta: `${definicion.ruta}?${vuelta}` }
        : { errores: escritura.errores };
    }),
  );
  if (!resultado.ok) {
    return { escrito, errores: {}, error: pantallaDeCodigo(resultado.codigo) };
  }
  if ("errores" in resultado.valor) {
    return { escrito, errores: resultado.valor.errores };
  }
  redirect(resultado.valor.ruta);
}

export async function crearRegistro(
  entidad: string,
  vuelta: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(entidad, vuelta, formulario, (actor, definicion, escrito) =>
    armado().abm.crear(actor, definicion, escrito),
  );
}

export async function guardarRegistro(
  entidad: string,
  id: string,
  vuelta: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(entidad, vuelta, formulario, (actor, definicion, escrito) =>
    armado().abm.guardar(actor, definicion, id, escrito),
  );
}

/** La baja, ya confirmada. */
export async function darDeBajaRegistro(
  entidad: string,
  id: string,
  vuelta: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(entidad, vuelta, formulario, async (actor, definicion) => {
    await armado().abm.marcarEliminado(actor, definicion, id);
    return { ok: true };
  });
}
