/**
 * `RepositorioCobros` con Prisma (F2-07, ADR 0037): la fila se lee y se escribe
 * con lo mismo que la de un ABM (`crearEscrituraPrisma`, con su auditoría); las
 * fechas, los importes y el tipo de cambio pasan como en Pagos.
 */

import type {
  DatosCobro,
  RepositorioCobros,
} from "../../puertos/repositorios/cobros.ts";
import { aDia, deDia, importeDeColumnas } from "./abm/egresos.ts";
import { crearEscrituraPrisma, desdeFila } from "./abm/repositorio.ts";
import type { Cobro as FilaCobro, Prisma } from "./generado/client.ts";

type DatosDeFila = Omit<
  FilaCobro,
  | "id"
  | "creadoEn"
  | "creadoPor"
  | "actualizadoEn"
  | "actualizadoPor"
  | "eliminadoEn"
  | "eliminadoPor"
>;

const paso = {
  aDatos({
    fecha,
    importeCentavos,
    importeMoneda,
    retencionCentavos,
    entradaCentavos,
    entradaMoneda,
    cambioNumerador,
    cambioDenominador,
    ...resto
  }: DatosDeFila): DatosCobro {
    return {
      ...resto,
      fecha: aDia(fecha),
      importe: importeDeColumnas(importeCentavos, importeMoneda),
      // La retención está en la moneda del importe: no tiene columna propia.
      retencion:
        retencionCentavos === null
          ? null
          : importeDeColumnas(retencionCentavos, importeMoneda),
      entrada: importeDeColumnas(entradaCentavos, entradaMoneda),
      cambioValor:
        cambioNumerador === null || cambioDenominador === null
          ? null
          : { numerador: cambioNumerador, denominador: cambioDenominador },
    };
  },

  aFila({
    fecha,
    importe,
    retencion,
    entrada,
    cambioValor,
    ...resto
  }: DatosCobro): DatosDeFila {
    return {
      ...resto,
      fecha: deDia(fecha),
      importeCentavos: importe.centavos,
      importeMoneda: importe.moneda,
      retencionCentavos: retencion?.centavos ?? null,
      entradaCentavos: entrada.centavos,
      entradaMoneda: entrada.moneda,
      cambioNumerador: cambioValor?.numerador ?? null,
      cambioDenominador: cambioValor?.denominador ?? null,
    };
  },
};

/** Un `RepositorioCobros` en la transacción de `cliente`. */
export function crearRepositorioCobrosPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioCobros {
  return {
    ...crearEscrituraPrisma<FilaCobro, DatosCobro>(
      cliente,
      "Cobro",
      cliente.cobro,
      paso,
    ),

    async bloquearCuenta(cuentaId) {
      await cliente.$queryRaw`SELECT 1 FROM cuentas WHERE id = ${cuentaId}::uuid FOR SHARE`;
    },

    async listarDe(facturaIds) {
      const filas = await cliente.cobro.findMany({
        where: { facturaId: { in: [...facturaIds] }, eliminadoEn: null },
        orderBy: [{ fecha: "asc" }, { creadoEn: "asc" }],
      });
      return filas.map((fila) => desdeFila(fila, paso));
    },
  };
}
