/**
 * Cómo vuelve una acción de servidor que salió bien (fix 13): si la persona ya
 * está en la pantalla de `ruta`, no se navega, se refrescan los datos en el
 * lugar (la ventana abierta, el scroll y el foco quedan como estaban) y la
 * acción devuelve `true` para que el formulario avise y cierre su ventana. Si
 * es otra pantalla, o la ruta trae parámetros que hay que mostrar (un error),
 * se navega como siempre.
 *
 * Solo para acciones de servidor: lee la cabecera `referer` de la pedida.
 */

import { refresh } from "next/cache.js";
import { headers } from "next/headers.js";
import { redirect } from "next/navigation.js";

/** `true`: se quedó y refrescó. Si no, redirige (no vuelve). */
export async function volverEnElLugar(
  ruta: string,
  { conParametros = false }: { readonly conParametros?: boolean } = {},
): Promise<true> {
  refresh();
  const origen = await paginaDeOrigen();
  const destino = new URL(ruta, origen ?? "http://local");
  if (
    origen !== null &&
    origen.pathname === destino.pathname &&
    (conParametros || destino.search === "")
  ) {
    return true;
  }
  redirect(ruta);
}

async function paginaDeOrigen(): Promise<URL | null> {
  const referer = (await headers()).get("referer");
  if (referer === null) {
    return null;
  }
  try {
    return new URL(referer);
  } catch {
    return null;
  }
}
