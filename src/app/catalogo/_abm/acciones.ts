"use server";

/**
 * Las acciones de escritura de todos los ABM (F1-03, ADR 0031). Las pantallas
 * del molde les atan el nombre de la entidad (y el id): llegan de afuera, así
 * que la entidad se busca entre las definiciones (`DOM-0009` si no hay) y el id
 * lo valida el caso de uso. El `Actor` sale solo de la sesión, y si esa persona puede escribir lo
 * decide el caso de uso.
 *
 * Alta y edición devuelven el estado del formulario si algo no pasó: lo que la
 * persona escribió, el mensaje de cada campo o el error con su código. Si pasó,
 * redirigen al listado.
 */

import { redirect } from "next/navigation.js";
import type { ResultadoEscritura } from "../../../casos-uso/abm/abm.ts";
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

/** Los campos de texto del formulario, tal cual se escribieron. Lo que agrega React (`$ACTION_...`) no es de la persona. */
function escritoEn(formulario: FormData): Escrito {
  const escrito: Record<string, string> = {};
  for (const [nombre, valor] of formulario) {
    if (typeof valor === "string" && !nombre.startsWith("$ACTION_")) {
      escrito[nombre] = valor;
    }
  }
  return escrito;
}

function escribir(
  entidad: string,
  formulario: FormData,
  trabajo: <E extends EntidadAbm>(
    actor: Actor,
    definicion: DefinicionAbm<E>,
    escrito: Escrito,
  ) => Promise<ResultadoEscritura<E>>,
): Promise<EstadoFormulario> {
  const escrito = escritoEn(formulario);
  return conDefinicion(entidad, async (definicion) => {
    const resultado = await conActorDeSesion((actor) =>
      trabajo(actor, definicion, escrito),
    );
    if (!resultado.ok) {
      return {
        escrito,
        errores: {},
        error: pantallaDeCodigo(resultado.codigo),
      };
    }
    if (!resultado.valor.ok) {
      return { escrito, errores: resultado.valor.errores };
    }
    redirect(definicion.ruta);
  });
}

export async function crearRegistro(
  entidad: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(entidad, formulario, (actor, definicion, escrito) =>
    armado().abm.crear(actor, definicion, escrito),
  );
}

export async function guardarRegistro(
  entidad: string,
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(entidad, formulario, (actor, definicion, escrito) =>
    armado().abm.guardar(actor, definicion, id, escrito),
  );
}

/** La baja, ya confirmada. Vuelve al listado; si no pasó, con `?error=<código>`. */
export async function darDeBajaRegistro(
  entidad: string,
  id: string,
): Promise<never> {
  return conDefinicion(entidad, async (definicion) => {
    const resultado = await conActorDeSesion((actor) =>
      armado().abm.marcarEliminado(actor, definicion, id),
    );
    redirect(
      resultado.ok
        ? definicion.ruta
        : `${definicion.ruta}?${new URLSearchParams({ error: resultado.codigo })}`,
    );
  });
}
