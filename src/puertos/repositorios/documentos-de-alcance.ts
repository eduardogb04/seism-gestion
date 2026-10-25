/**
 * Los documentos de alcance de un servicio (F5-01, ADR 0047): el dueño de un
 * archivo adjunto antes de cotizar. Solo se agregan y se listan.
 *
 * Implementado con Prisma en `src/adaptadores/prisma/documentos-de-alcance.ts`.
 */

import type { RegistroDe, RepositorioDe } from "./abm.ts";

export type DatosDocumentoDeAlcance = {
  readonly servicioId: string;
  readonly documentoId: string;
};

export type DocumentoDeAlcance = RegistroDe<DatosDocumentoDeAlcance>;

export type RepositorioDocumentosDeAlcance = Pick<
  RepositorioDe<DatosDocumentoDeAlcance>,
  "crear"
> & {
  /** Los no eliminados de un servicio, del más viejo al más nuevo. */
  listarDe(servicioId: string): Promise<readonly DocumentoDeAlcance[]>;
};
