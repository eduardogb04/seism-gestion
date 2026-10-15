/**
 * Un egreso de un centro de costo de clase proyecto tiene que decir de qué
 * servicio es (para ver la rentabilidad del proyecto); uno de otra clase, no.
 * La clase está en otra tabla, así que la regla no puede ser un `CHECK` de la
 * base ni una validación de los datos del egreso solos.
 */

import type { DatosAbm } from "../../puertos/repositorios/abm.ts";
import type { RepositoriosEnTransaccion } from "../../puertos/repositorios/transaccion.ts";

const CLASE_PROYECTO = "proyecto";

export async function rechazosPorServicio(
  repos: RepositoriosEnTransaccion,
  nuevos: DatosAbm<"Egreso">,
): Promise<Readonly<Record<string, string>>> {
  const centro = await repos
    .abm("CentroCosto")
    .buscarPorId(nuevos.centroCostoId);
  if (centro === null) {
    return {};
  }
  const esDeProyecto = centro.valor.clase === CLASE_PROYECTO;
  if (esDeProyecto && nuevos.servicioId === null) {
    return {
      servicioId:
        "Un egreso de un centro de costo de proyecto tiene que decir de qué servicio es",
    };
  }
  return !esDeProyecto && nuevos.servicioId !== null
    ? {
        servicioId:
          "Solo los egresos de centros de costo de proyecto llevan servicio",
      }
    : {};
}
