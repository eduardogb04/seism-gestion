/**
 * La descarga de un documento adjunto (F2-05, ADR 0035): por el id de su fila,
 * nunca por la clave del almacén, y solo con sesión. Sin sesión redirige a
 * `AUT-0002` antes de leer nada; un documento que no existe, que está dado de
 * baja o que el almacén perdió es 404.
 */

import { codigoDeError } from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import { cabecerasDeDescarga } from "../cabeceras.ts";

export async function GET(
  _pedido: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
): Promise<Response> {
  await sesionExigida();
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
