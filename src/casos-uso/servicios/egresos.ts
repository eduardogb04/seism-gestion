/**
 * Los egresos imputados a un servicio (F2-08), para su pantalla: cada uno ya
 * escrito para mostrarse y el total por moneda, sin convertir una moneda en
 * otra. Solo los vigentes.
 */

import {
  crearImporte,
  formatearImporte,
  MONEDAS,
} from "../../dominio/compartido/importe.ts";
import type { Transaccional } from "../../puertos/repositorios/transaccion.ts";
import { TODAS } from "../abm/abm.ts";
import { diaConBarras } from "../abm/definicion.ts";
import { servicioVigente } from "./servicios.ts";

type EgresoDeServicio = {
  readonly id: string;
  readonly fecha: string;
  readonly concepto: string;
  readonly centroCosto: string;
  readonly importe: string;
};

export type EgresosDeServicio = {
  readonly egresos: readonly EgresoDeServicio[];
  /** Uno por moneda que tenga egresos: `ARS 1.234,50`. */
  readonly totales: readonly string[];
};

export type CasosUsoEgresosDeServicio = {
  /** `DOM-0009` si el servicio no existe o está dado de baja. */
  listar(servicioId: string): Promise<EgresosDeServicio>;
};

export function crearCasosUsoEgresosDeServicio({
  transaccional,
}: {
  readonly transaccional: Transaccional;
}): CasosUsoEgresosDeServicio {
  return {
    listar(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        const { registros } = await repos.abm("Egreso").listar({
          buscaEn: [],
          filtros: [{ columna: "servicioId", igual: servicioId }],
          marcadas: [],
          mes: null,
          orden: "fecha",
          direccion: "asc",
          saltear: 0,
          cantidad: TODAS,
        });
        const centros = new Map<string, string>(
          (
            await repos
              .abm("CentroCosto")
              .buscarPorIds(registros.map(({ valor }) => valor.centroCostoId))
          ).map(({ valor }) => [valor.id, valor.nombre]),
        );
        return {
          egresos: registros.map(({ valor }) => ({
            id: valor.id,
            fecha: diaConBarras(valor.fecha),
            concepto: valor.concepto,
            centroCosto: centros.get(valor.centroCostoId) ?? "",
            importe: formatearImporte(valor.importe),
          })),
          totales: MONEDAS.flatMap((moneda) => {
            const deLaMoneda = registros.filter(
              ({ valor }) => valor.importe.moneda === moneda,
            );
            return deLaMoneda.length === 0
              ? []
              : [
                  formatearImporte(
                    crearImporte(
                      deLaMoneda.reduce(
                        (suma, { valor }) => suma + valor.importe.centavos,
                        0n,
                      ),
                      moneda,
                    ),
                  ),
                ];
          }),
        };
      });
    },
  };
}
