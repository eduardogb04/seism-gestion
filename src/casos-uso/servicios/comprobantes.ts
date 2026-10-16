/**
 * Lo que comparten las órdenes de compra y las facturas de un servicio (F2-06,
 * ADR 0036): el importe, su tipo de cambio (F3-04), el documento que es opcional
 * y el nombre de quien las cargó. Un documento adjunto se guarda y se da de baja
 * como el de una cotización (`documentos.ts`); acá solo se decide si hay uno.
 */

import { z } from "zod";
import type { Actor } from "../../dominio/compartido/actor.ts";
import { marcarActualizado } from "../../dominio/compartido/auditable.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import {
  type CambioDeDocumento,
  type Importe,
  MONEDAS,
  type Moneda,
} from "../../dominio/compartido/importe.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import type { RepositorioDe } from "../../puertos/repositorios/abm.ts";
import type { RepositoriosEnTransaccion } from "../../puertos/repositorios/transaccion.ts";
import { type ErroresPorCampo, validarEscrito } from "../abm/abm.ts";
import {
  type cambioVisible,
  escritoDeCambio,
  mismoCambio,
} from "../abm/cambio.ts";
import {
  type CampoAbm,
  type CamposAbm,
  type Escrito,
  nombreDeMoneda,
} from "../abm/definicion.ts";
import { cambioDeDocumento } from "../abm/validaciones.ts";
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

/** El campo del tipo de cambio de un comprobante, ligado a su importe. */
export const CAMPO_DE_CAMBIO: readonly [string, CampoAbm] = [
  "cambio",
  {
    tipo: "tipoDeCambio",
    etiqueta: "Tipo de cambio (pesos por dólar)",
    importe: "importe",
  },
];

const CAMPOS_DE_CAMBIO: CamposAbm = [CAMPO_DE_CAMBIO];

const VALIDACION_DE_CAMBIO = z.object({ cambio: cambioDeDocumento });

/** El tipo de cambio de un comprobante como se ve en su tabla (`null`: es en pesos, no se pide). */
export type CambioListado = ReturnType<typeof cambioVisible>;

/** Lo único que `guardarCambio` necesita de un comprobante. */
type ConCambio = {
  readonly importe: Importe<Moneda>;
  readonly cambio: CambioDeDocumento | null;
};

export type ResultadoDeCambio =
  | { readonly ok: true }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

/** El formulario para completar o cambiar el tipo de cambio de un comprobante: el campo y lo que ya tiene. */
export function formularioDeCambio(valor: ConCambio): {
  readonly campos: CamposAbm;
  readonly escrito: Escrito;
} {
  return {
    campos: CAMPOS_DE_CAMBIO,
    escrito: {
      [nombreDeMoneda("importe")]: valor.importe.moneda,
      ...escritoDeCambio("cambio", valor.cambio),
    },
  };
}

/**
 * Guarda el tipo de cambio de un comprobante ya cargado, con las mismas reglas
 * que al cargarlo (obligatorio en dólares, rechazado en pesos). Sin cambios no
 * escribe. `DOM-0009` si no existe o está anulado.
 */
export async function guardarCambio<D extends ConCambio>(
  actor: Actor,
  reloj: Reloj,
  repositorio: Pick<RepositorioDe<D>, "buscarPorId" | "actualizar">,
  entidad: string,
  id: string,
  escrito: Escrito,
): Promise<ResultadoDeCambio> {
  const actual = z.uuid().safeParse(id).success
    ? await repositorio.buscarPorId(id)
    : null;
  if (actual === null || actual.eliminadoEn !== undefined) {
    throw nuevoError(catalogo.DOM_0009, { entidad, id });
  }
  const validado = validarEscrito(CAMPOS_DE_CAMBIO, VALIDACION_DE_CAMBIO, {
    ...escrito,
    [nombreDeMoneda("importe")]: actual.valor.importe.moneda,
  });
  if (!validado.ok) {
    return { ok: false, errores: validado.errores };
  }
  if (mismoCambio(actual.valor.cambio, validado.datos.cambio)) {
    return { ok: true };
  }
  const cambiado = marcarActualizado(
    actual,
    { ...actual.valor, cambio: validado.datos.cambio },
    actor,
    reloj,
  );
  if (!cambiado.ok) {
    throw nuevoError(catalogo.DOM_0009, { entidad, id });
  }
  await repositorio.actualizar(actor, cambiado.valor, "actualizar");
  return { ok: true };
}

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
