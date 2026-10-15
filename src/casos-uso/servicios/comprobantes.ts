/**
 * Lo que comparten las órdenes de compra y las facturas de un servicio (F2-06,
 * ADR 0036): el importe, el documento que es opcional y el nombre de quien las
 * cargó. Un documento adjunto se guarda y se da de baja como el de una
 * cotización (`documentos.ts`); acá solo se decide si hay uno.
 */

import { z } from "zod";
import type { Actor } from "../../dominio/compartido/actor.ts";
import { MONEDAS } from "../../dominio/compartido/importe.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import type { RepositoriosEnTransaccion } from "../../puertos/repositorios/transaccion.ts";
import {
  type ArchivoSubido,
  type DependenciasDeAdjuntos,
  marcarDocumentoEliminado,
  registrarDocumento,
  tamanoLegible,
  validarArchivo,
} from "../documentos/documentos.ts";

type ArchivoValido = Extract<
  ReturnType<typeof validarArchivo>,
  { readonly ok: true }
>["archivo"];

/** El importe del formulario: mayor que cero, en una moneda conocida. */
export const importeMayorQueCero = z.object({
  centavos: z.bigint().positive("El importe tiene que ser mayor que cero."),
  moneda: z.enum(MONEDAS),
});

/** El documento de un comprobante, como se muestra. */
export type DocumentoListado = {
  readonly id: string;
  readonly nombre: string;
  readonly tamano: string;
};

/** Sin archivo elegido es válido: el documento es opcional. */
export function validarAdjuntoOpcional(
  archivo: ArchivoSubido | null,
):
  | { readonly ok: true; readonly archivo: ArchivoValido | null }
  | { readonly ok: false; readonly mensaje: string } {
  if (archivo === null) {
    return { ok: true, archivo: null };
  }
  return validarArchivo(archivo);
}

/** Guarda el archivo, si hay, y devuelve el id de su documento. */
export async function guardarAdjuntoOpcional(
  actor: Actor,
  repos: RepositoriosEnTransaccion,
  adjuntos: DependenciasDeAdjuntos,
  archivo: ArchivoValido | null,
): Promise<string | null> {
  return archivo === null
    ? null
    : registrarDocumento(actor, repos, adjuntos, archivo);
}

/** Da de baja el documento, si tiene uno. */
export async function bajaDeAdjuntoOpcional(
  actor: Actor,
  repos: RepositoriosEnTransaccion,
  reloj: Reloj,
  documentoId: string | null,
): Promise<void> {
  if (documentoId !== null) {
    await marcarDocumentoEliminado(actor, repos, reloj, documentoId);
  }
}

/** Los documentos de los comprobantes, por el id que cada uno guarda (uno sin documento, `null`). */
export async function documentosListados(
  repos: RepositoriosEnTransaccion,
  ids: readonly (string | null)[],
): Promise<(id: string | null) => DocumentoListado | null> {
  const documentos = await repos.documentos.buscarPorIds(
    ids.filter((id) => id !== null),
  );
  return (id) => {
    const documento = documentos.find(({ valor }) => valor.id === id)?.valor;
    return documento === undefined
      ? null
      : {
          id: documento.id,
          nombre: documento.nombre,
          tamano: tamanoLegible(documento.tamano),
        };
  };
}
