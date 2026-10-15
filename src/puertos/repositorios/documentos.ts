/**
 * El repositorio de documentos adjuntos (F2-05, ADR 0035): el metadato de un
 * archivo cuyos bytes están en el `AlmacenDocumentos`. De qué cuelga lo dice
 * la clave foránea del registro dueño (`documento_id`), no este repositorio.
 *
 * Como en los demás repositorios, el adaptador deja la auditoría de cada
 * escritura. No hay borrado: dar de baja es `actualizar` un registro que ya
 * trae `eliminadoEn`.
 *
 * Implementado con Prisma en `src/adaptadores/prisma/documentos.ts`.
 */

import type { Referencia } from "../almacen-documentos.ts";
import type { RegistroDe, RepositorioDe } from "./abm.ts";

export type DatosDocumento = {
  readonly referencia: Referencia;
  /** Como se llamaba el archivo al subirlo. */
  readonly nombre: string;
  /** El tipo que sale de la extensión validada, no de lo que declaró el navegador. */
  readonly tipoMime: string;
  /** En bytes. */
  readonly tamano: number;
};

export type Documento = RegistroDe<DatosDocumento>;

export type RepositorioDocumentos = Pick<
  RepositorioDe<DatosDocumento>,
  "buscarPorId" | "buscarPorIds" | "crear" | "actualizar"
>;
