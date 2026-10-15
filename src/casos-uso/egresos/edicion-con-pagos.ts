/**
 * Un egreso con pagos vigentes no baja de lo ya pagado ni cambia de moneda. La
 * base lo impide (un trigger de la migración de pagos) y queda como red; esto
 * lo dice antes, al lado del importe, para que la persona no vea un error genérico.
 */

import {
  crearImporte,
  formatearImporte,
} from "../../dominio/compartido/importe.ts";
import type { DatosAbm, RegistroAbm } from "../../puertos/repositorios/abm.ts";
import type { RepositoriosEnTransaccion } from "../../puertos/repositorios/transaccion.ts";

const TODAS = 2 ** 31 - 1;

export async function rechazosPorPagos(
  repos: RepositoriosEnTransaccion,
  actual: RegistroAbm<"Egreso">,
  nuevos: DatosAbm<"Egreso">,
): Promise<Readonly<Record<string, string>>> {
  const { registros } = await repos.pagos.listar({
    buscaEn: [],
    filtros: [{ columna: "egresoId", igual: actual.valor.id }],
    marcadas: [],
    mes: null,
    orden: "fecha",
    direccion: "asc",
    saltear: 0,
    cantidad: TODAS,
  });
  if (registros.length === 0) {
    return {};
  }
  if (nuevos.importe.moneda !== actual.valor.importe.moneda) {
    return {
      importe: `No se puede cambiar la moneda: el egreso ya tiene pagos en ${actual.valor.importe.moneda}.`,
    };
  }
  const pagado = crearImporte(
    registros.reduce((suma, { valor }) => suma + valor.importe.centavos, 0n),
    actual.valor.importe.moneda,
  );
  return nuevos.importe.centavos < pagado.centavos
    ? {
        importe: `El importe no puede ser menor que lo ya pagado (${formatearImporte(pagado)}).`,
      }
    : {};
}
