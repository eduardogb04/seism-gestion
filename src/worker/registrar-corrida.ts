/**
 * El envoltorio único de toda corrida de un job (F0-25, ADR 0025): ningún job
 * corre sin pasar por acá.
 *
 * 1. Inserta la fila con `inicio` **antes** de correr el job.
 * 2. Corre el job.
 * 3. En `finally`, pase lo que pase, pone `fin` y `resultado` (`ok`/`error`);
 *    con error, `detalle` = código del catálogo + mensaje, redactado.
 * 4. Si el job lanzó, **relanza** el mismo error: registrar no es
 *    tragárselo. Quien lo llama (el planificador) lo loguea con su código.
 */

import { detalleDeFalla } from "../infraestructura/fallas.ts";
import type {
  RegistroCorridas,
  ResultadoCorrida,
} from "../puertos/repositorios/corridas-worker.ts";

export type RegistrarCorrida = (
  job: string,
  ejecutar: () => Promise<void>,
) => Promise<void>;

export type DependenciasRegistro = {
  readonly corridas: RegistroCorridas;
  /** El reloj del worker: marca `inicio` y `fin`. */
  readonly ahora: () => Date;
};

export function crearRegistrarCorrida(
  deps: DependenciasRegistro,
): RegistrarCorrida {
  return async (job, ejecutar) => {
    const id = await deps.corridas.iniciar(job, deps.ahora());
    let resultado: ResultadoCorrida = "error";
    let detalle: string | null = null;
    try {
      await ejecutar();
      resultado = "ok";
    } catch (causa) {
      detalle = detalleDeFalla(causa);
      throw causa;
    } finally {
      await deps.corridas.terminar(id, {
        fin: deps.ahora(),
        resultado,
        detalle,
      });
    }
  };
}
