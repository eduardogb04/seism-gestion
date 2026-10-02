/**
 * `RepositorioDocumentos` con Prisma (F2-05, ADR 0035): la fila se lee y se
 * escribe con lo mismo que la de un ABM (`crearEscrituraPrisma`, con su
 * auditoría).
 */

import { referenciaDesde } from "../../puertos/almacen-documentos.ts";
import type {
  DatosDocumento,
  RepositorioDocumentos,
} from "../../puertos/repositorios/documentos.ts";
import { crearEscrituraPrisma, desdeFila } from "./abm/repositorio.ts";
import type { Documento as FilaDocumento, Prisma } from "./generado/client.ts";

type DatosDeFila = Omit<
  FilaDocumento,
  | "id"
  | "creadoEn"
  | "creadoPor"
  | "actualizadoEn"
  | "actualizadoPor"
  | "eliminadoEn"
  | "eliminadoPor"
>;

const paso = {
  aDatos: ({ referencia, ...resto }: DatosDeFila): DatosDocumento => ({
    ...resto,
    referencia: referenciaDesde(referencia),
  }),
  aFila: (datos: DatosDocumento) => datos,
};

/** Un `RepositorioDocumentos` en la transacción de `cliente`. */
export function crearRepositorioDocumentosPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioDocumentos {
  return {
    ...crearEscrituraPrisma<FilaDocumento, DatosDocumento>(
      cliente,
      "Documento",
      cliente.documento,
      paso,
    ),

    async buscarPorIds(ids) {
      const filas = await cliente.documento.findMany({
        where: { id: { in: [...ids] } },
      });
      return filas.map((fila) => desdeFila(fila, paso));
    },
  };
}
