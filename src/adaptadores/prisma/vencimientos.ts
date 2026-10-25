/**
 * `RepositorioVencimientos` con Prisma (F4-02): la fila se lee y se escribe con
 * lo mismo que la de un ABM (`crearEscrituraPrisma`, con su auditoría); la
 * fecha pasa como en Egresos.
 */

import type {
  DatosVencimiento,
  RepositorioVencimientos,
} from "../../puertos/repositorios/vencimientos.ts";
import { aDia, deDia } from "./abm/egresos.ts";
import { crearEscrituraPrisma, desdeFila } from "./abm/repositorio.ts";
import type {
  ServicioVencimiento as FilaVencimiento,
  Prisma,
} from "./generado/client.ts";

type Auditoria =
  | "id"
  | "creadoEn"
  | "creadoPor"
  | "actualizadoEn"
  | "actualizadoPor"
  | "eliminadoEn"
  | "eliminadoPor";

const paso = {
  aDatos({
    fecha,
    ...resto
  }: Omit<FilaVencimiento, Auditoria>): DatosVencimiento {
    return { ...resto, fecha: aDia(fecha) };
  },

  aFila({
    fecha,
    ...resto
  }: DatosVencimiento): Omit<FilaVencimiento, Auditoria> {
    return { ...resto, fecha: deDia(fecha) };
  },
};

/** Un `RepositorioVencimientos` en la transacción de `cliente`. */
export function crearRepositorioVencimientosPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioVencimientos {
  return {
    ...crearEscrituraPrisma<FilaVencimiento, DatosVencimiento>(
      cliente,
      "ServicioVencimiento",
      cliente.servicioVencimiento,
      paso,
    ),

    async listarDe(servicioId) {
      const filas = await cliente.servicioVencimiento.findMany({
        where: { servicioId, eliminadoEn: null },
        orderBy: [{ fecha: "asc" }, { creadoEn: "asc" }],
      });
      return filas.map((fila) => desdeFila(fila, paso));
    },

    async pendienteDeContratoDe(servicioId) {
      const fila = await cliente.servicioVencimiento.findFirst({
        where: {
          servicioId,
          clase: "contrato",
          estado: "pendiente",
          eliminadoEn: null,
        },
      });
      return fila === null ? null : desdeFila(fila, paso);
    },
  };
}
