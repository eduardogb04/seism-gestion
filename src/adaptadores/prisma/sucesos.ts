/**
 * `RepositorioSucesos` con Prisma (F3-01, ADR 0039): la fila se lee y se
 * escribe con lo mismo que la de un ABM (`crearEscrituraPrisma`, con su
 * auditoría); la fecha pasa como en Egresos.
 */

import type {
  DatosSuceso,
  RepositorioSucesos,
} from "../../puertos/repositorios/sucesos.ts";
import { aDia, deDia } from "./abm/egresos.ts";
import { crearEscrituraPrisma, desdeFila } from "./abm/repositorio.ts";
import type {
  ServicioSuceso as FilaSuceso,
  Prisma,
} from "./generado/client.ts";

type DatosDeFila = Omit<
  FilaSuceso,
  | "id"
  | "creadoEn"
  | "creadoPor"
  | "actualizadoEn"
  | "actualizadoPor"
  | "eliminadoEn"
  | "eliminadoPor"
>;

const paso = {
  aDatos({ fecha, ...resto }: DatosDeFila): DatosSuceso {
    return { ...resto, fecha: aDia(fecha) };
  },

  aFila({ fecha, ...resto }: DatosSuceso): DatosDeFila {
    return { ...resto, fecha: deDia(fecha) };
  },
};

/** Un `RepositorioSucesos` en la transacción de `cliente`. */
export function crearRepositorioSucesosPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioSucesos {
  return {
    ...crearEscrituraPrisma<FilaSuceso, DatosSuceso>(
      cliente,
      "ServicioSuceso",
      cliente.servicioSuceso,
      paso,
    ),

    async delCliente(clienteId) {
      const filas = await cliente.servicioSuceso.findMany({
        where: {
          OR: [
            { servicioId: null, clienteId },
            { eliminadoEn: null, servicio: { clienteId } },
          ],
        },
        include: { servicio: { select: { id: true, codigo: true } } },
        orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
      });
      return filas.map(({ servicio, ...fila }) => ({
        suceso: desdeFila(fila, paso),
        servicio,
      }));
    },

    async haySueltasDe(clienteId) {
      return (
        (await cliente.servicioSuceso.findFirst({
          where: { clienteId, servicioId: null, eliminadoEn: null },
        })) !== null
      );
    },

    async listarDe(servicioId) {
      const filas = await cliente.servicioSuceso.findMany({
        where: { servicioId, eliminadoEn: null },
        orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
      });
      return filas.map((fila) => desdeFila(fila, paso));
    },
  };
}
