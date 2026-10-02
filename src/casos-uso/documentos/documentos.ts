/**
 * Documentos adjuntos (F2-05, ADR 0035): la pieza que cualquier registro con un
 * archivo reutiliza (cotizaciones, órdenes de compra, facturas, egresos).
 *
 * - `validarArchivo`: la extensión del nombre tiene que estar en la lista y los
 *   primeros bytes tienen que corresponder a esa familia; el tipo MIME que se
 *   guarda sale de la extensión validada, no de lo que declara el navegador.
 * - `registrarDocumento`: guarda los bytes en el almacén y la fila `documento`
 *   en la transacción del registro dueño. Si esa transacción falla después,
 *   el archivo queda huérfano en el almacén (ADR 0035): no hay limpieza.
 * - `descargar`: el metadato por su id (nunca por la clave del almacén) y los
 *   bytes.
 */

import { z } from "zod";
import type { Actor } from "../../dominio/compartido/actor.ts";
import {
  crearAuditable,
  marcarEliminado,
} from "../../dominio/compartido/auditable.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../../dominio/compartido/identificador.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import type {
  AlmacenDocumentos,
  Referencia,
} from "../../puertos/almacen-documentos.ts";
import type { GeneradorId } from "../../puertos/generador-id.ts";
import type {
  RepositoriosEnTransaccion,
  Transaccional,
} from "../../puertos/repositorios/transaccion.ts";

export const TOPE_DE_DOCUMENTO = 10 * 1024 * 1024;
const LARGO_MAXIMO_DE_NOMBRE = 200;

type Tipo = {
  readonly mime: string;
  /** Con qué bytes empieza un archivo de esta familia. */
  readonly firma: readonly number[];
};

const PDF: Tipo = { mime: "application/pdf", firma: [0x25, 0x50, 0x44, 0x46] };
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0];
const JPEG: Tipo = { mime: "image/jpeg", firma: [0xff, 0xd8, 0xff] };

const TIPOS: Readonly<Record<string, Tipo>> = {
  pdf: PDF,
  doc: { mime: "application/msword", firma: OLE },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    firma: ZIP,
  },
  xls: { mime: "application/vnd.ms-excel", firma: OLE },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    firma: ZIP,
  },
  jpg: JPEG,
  jpeg: JPEG,
  png: {
    mime: "image/png",
    firma: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
};

/** El `accept` del campo de archivo: la misma lista que valida el servidor. */
export const ACEPTA = Object.keys(TIPOS)
  .map((extension) => `.${extension}`)
  .join(",");

/** Un archivo como llega de un formulario. */
export type ArchivoSubido = {
  readonly nombre: string;
  readonly bytes: Uint8Array;
};

export type ArchivoValido = ArchivoSubido & { readonly tipoMime: string };

type Validado =
  | { readonly ok: true; readonly archivo: ArchivoValido }
  | { readonly ok: false; readonly mensaje: string };

/** El navegador no conserva el archivo elegido cuando el formulario vuelve con errores. */
function rechazo(motivo: string): Validado {
  return {
    ok: false,
    mensaje: `${motivo} Volvé a elegir el archivo: el navegador no lo conserva.`,
  };
}

/** `null`: no se eligió ninguno. El mensaje es el que ve la persona, al lado del campo. */
export function validarArchivo(archivo: ArchivoSubido | null): Validado {
  if (archivo === null) {
    return { ok: false, mensaje: "Elegí el documento." };
  }
  const { nombre, bytes } = archivo;
  if (nombre.length > LARGO_MAXIMO_DE_NOMBRE) {
    return rechazo(
      `El nombre del archivo no puede pasar de ${LARGO_MAXIMO_DE_NOMBRE} caracteres.`,
    );
  }
  const extension = nombre.slice(nombre.lastIndexOf(".") + 1).toLowerCase();
  const tipo = nombre.includes(".") ? TIPOS[extension] : undefined;
  if (tipo === undefined) {
    return rechazo("Solo se admiten PDF, Word, Excel, JPG o PNG.");
  }
  if (bytes.length === 0) {
    return rechazo("El archivo está vacío.");
  }
  if (bytes.length > TOPE_DE_DOCUMENTO) {
    return rechazo("El archivo pesa más de 10 MB.");
  }
  if (!tipo.firma.every((byte, posicion) => bytes[posicion] === byte)) {
    return rechazo("El archivo no es del tipo que dice su extensión.");
  }
  return { ok: true, archivo: { nombre, bytes, tipoMime: tipo.mime } };
}

/** `1,5 MB`, `300 KB`, `31 bytes`. */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export type DependenciasDeAdjuntos = {
  readonly almacen: AlmacenDocumentos;
  /** La clave de un documento nuevo (`nuevaClaveDocumento`). */
  readonly nuevaClave: () => Referencia;
  readonly reloj: Reloj;
  readonly generadorId: GeneradorId;
};

/** Guarda los bytes y crea la fila `documento` en la transacción de `repos`: devuelve su id. */
export async function registrarDocumento(
  actor: Actor,
  repos: RepositoriosEnTransaccion,
  { almacen, nuevaClave, reloj, generadorId }: DependenciasDeAdjuntos,
  { nombre, bytes, tipoMime }: ArchivoValido,
): Promise<string> {
  const referencia = await almacen.guardar(nuevaClave(), bytes, tipoMime);
  const id = identificadorDesde<string>(generadorId.generar());
  await repos.documentos.crear(
    actor,
    crearAuditable(
      { id, referencia, nombre, tipoMime, tamano: bytes.length },
      actor,
      reloj,
    ),
  );
  return id;
}

/** La baja lógica del documento de un registro que se anula. `DOM-0009` si no existe o ya está de baja. */
export async function marcarDocumentoEliminado(
  actor: Actor,
  repos: RepositoriosEnTransaccion,
  reloj: Reloj,
  id: string,
): Promise<void> {
  const actual = await repos.documentos.buscarPorId(id);
  const eliminado =
    actual === null ? null : marcarEliminado(actual, actor, reloj);
  if (eliminado === null || !eliminado.ok) {
    throw nuevoError(catalogo.DOM_0009, { entidad: "Documento", id });
  }
  await repos.documentos.actualizar(actor, eliminado.valor, "eliminar");
}

export type DocumentoDescargable = {
  readonly nombre: string;
  readonly tipoMime: string;
  readonly bytes: Uint8Array;
};

export type CasosUsoDocumentos = {
  /** El documento vigente con ese id. `DOM-0009` si no existe o está dado de baja. */
  descargar(id: string): Promise<DocumentoDescargable>;
};

const esquemaId = z.uuid();

export function crearCasosUsoDocumentos({
  transaccional,
  almacen,
}: {
  readonly transaccional: Transaccional;
  readonly almacen: AlmacenDocumentos;
}): CasosUsoDocumentos {
  return {
    async descargar(id) {
      const documento = await transaccional.ejecutar(async (repos) =>
        esquemaId.safeParse(id).success
          ? repos.documentos.buscarPorId(id)
          : null,
      );
      if (documento === null || documento.eliminadoEn !== undefined) {
        throw nuevoError(catalogo.DOM_0009, { entidad: "Documento", id });
      }
      const { nombre, tipoMime, referencia } = documento.valor;
      // Los bytes se leen fuera de la transacción: no tiene por qué esperar al almacén.
      return { nombre, tipoMime, bytes: await almacen.leer(referencia) };
    },
  };
}
