/**
 * `RepositorioDocumentosDeAlcance` con Prisma (F5-01, ADR 0047): la fila se
 * escribe con lo mismo que la de un ABM (`crearEscrituraPrisma`, con su
 * auditoría).
 */

import type {
  DatosDocumentoDeAlcance,
  RepositorioDocumentosDeAlcance,
} from "../../puertos/repositorios/documentos-de-alcance.ts";
import { crearEscrituraPrisma, desdeFila } from "./abm/repositorio.ts";
import type {
  ServicioDocumento as FilaDocumentoDeAlcance,
  Prisma,
} from "./generado/client.ts";

const paso = {
  aDatos: ({
    servicioId,
    documentoId,
  }: FilaDocumentoDeAlcance): DatosDocumentoDeAlcance => ({
    servicioId,
    documentoId,
  }),
  aFila: (datos: DatosDocumentoDeAlcance) => datos,
};

/** Un `RepositorioDocumentosDeAlcance` en la transacción de `cliente`. */
export function crearRepositorioDocumentosDeAlcancePrisma(
  cliente: Prisma.TransactionClient,
): RepositorioDocumentosDeAlcance {
  const { crear } = crearEscrituraPrisma<
    FilaDocumentoDeAlcance,
    DatosDocumentoDeAlcance
  >(cliente, "ServicioDocumento", cliente.servicioDocumento, paso);
  return {
    crear,

    async listarDe(servicioId) {
      const filas = await cliente.servicioDocumento.findMany({
        where: { servicioId, eliminadoEn: null },
        orderBy: { creadoEn: "asc" },
      });
      return filas.map((fila) => desdeFila(fila, paso));
    },
  };
}
