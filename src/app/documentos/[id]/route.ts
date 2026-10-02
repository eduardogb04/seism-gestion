/**
 * La descarga de un documento adjunto (F2-05, ADR 0035): por el id de su fila,
 * nunca por la clave del almacén, y solo con sesión. Sin sesión es un 401 antes
 * de leer nada (un Route Handler no puede redirigir con `redirect`: ver
 * `sesion-de-cookie.ts`); un documento que no existe, que está dado de
 * baja o que el almacén perdió es 404.
 */

import { codigoDeError } from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { sesionActual } from "../../(auth)/sesion-de-cookie.ts";
import { cabecerasDeDescarga } from "../cabeceras.ts";

export async function GET(
  _pedido: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
): Promise<Response> {
  if ((await sesionActual()) === null) {
    return new Response(null, { status: 401 });
  }
  const { id } = await params;
  try {
    const { nombre, tipoMime, bytes } = await armado().documentos.descargar(id);
    return new Response(Buffer.from(bytes), {
      headers: cabecerasDeDescarga(nombre, tipoMime),
    });
  } catch (error) {
    const codigo = codigoDeError(error);
    if (codigo === "DOM-0009" || codigo === "ALM-0001") {
      return new Response(null, { status: 404 });
    }
    throw error;
  }
}
