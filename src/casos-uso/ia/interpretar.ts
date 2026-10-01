/**
 * `interpretar` (F0-28, ADR 0026): la única puerta a la IA. Nadie le habla a
 * un adaptador de IA sino a través de este caso de uso, que en orden:
 *
 * 1. **Tope.** Lee el tope del mes y el costo estimado del perfil
 *    (`configuracion`) y suma el gasto del mes civil del reloj inyectado. Si
 *    `acumulado + estimado > tope` (estrictamente: igual al tope se
 *    permite), **no llama** al adaptador, avisa por `AvisosIa` (que no lanza) y lanza
 *    `IA-0001` con `{ acumulado, estimado, tope, mes, perfil }`. No escribe
 *    fila: no hubo llamada. El que llamó atrapa `IA-0001` por su código y
 *    sigue "por reglas".
 * 2. **Llamada.** El adaptador devuelve la salida cruda.
 * 3. **Registro.** Escribe la fila de `uso_ia` —con la salida tal cual y si
 *    validó— **antes** de devolver o de lanzar `IA-0002`. Si no la puede
 *    escribir, lanza `INF-0001` y la propuesta no sale de acá.
 * 4. **Validación.** `esquemaSalida.safeParse`, siempre acá y no en el
 *    adaptador: ninguno puede saltearla. Si no valida, `IA-0002` con los
 *    problemas de Zod en `detalles`; nunca se devuelve una salida sin validar.
 */
import type { ZodType } from "zod";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import {
  formatearUsd,
  type MicroUsd,
} from "../../dominio/compartido/micro-usd.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import type { AdaptadorIa, AvisosIa } from "../../puertos/ia.ts";
import type { LectorConfiguracion } from "../../puertos/repositorios/configuracion.ts";
import type { RepositorioUsoIa } from "../../puertos/repositorios/uso-ia.ts";
import { leerCostoEstimado, leerTope, mesDe } from "./tope.ts";

export type DependenciasInterpretar = {
  readonly adaptador: AdaptadorIa;
  readonly usos: RepositorioUsoIa;
  readonly configuracion: LectorConfiguracion;
  readonly reloj: Reloj;
  readonly avisos: AvisosIa;
};

/** Qué se le pide a la IA y con qué esquema Zod se valida lo que conteste. */
export type PeticionIa<T> = {
  readonly perfil: string;
  readonly entrada: string;
  readonly esquemaSalida: ZodType<T>;
};

/** La propuesta ya validada y lo que costó obtenerla. */
export type InterpretacionIa<T> = {
  readonly propuesta: T;
  readonly modelo: string;
  readonly versionPrompt: string;
  /** En micro-dólares (ADR 0026). */
  readonly costoUsd: MicroUsd;
  readonly tokens: number;
};

export function crearInterpretar(dependencias: DependenciasInterpretar) {
  const { adaptador, usos, configuracion, reloj, avisos } = dependencias;

  return async function interpretar<T>(
    peticion: PeticionIa<T>,
  ): Promise<InterpretacionIa<T>> {
    const { perfil, entrada, esquemaSalida } = peticion;
    const ahora = reloj.ahora();
    const mes = mesDe(ahora);
    const tope = await leerTope(configuracion);
    const estimado = await leerCostoEstimado(configuracion, perfil);
    const acumulado = await usos.costoEntre(mes.desde, mes.hasta);

    if (acumulado + estimado > tope) {
      const error = nuevoError(catalogo.IA_0001, {
        acumulado: formatearUsd(acumulado),
        estimado: formatearUsd(estimado),
        tope: formatearUsd(tope),
        mes: mes.etiqueta,
        perfil,
      });
      await avisos.topeSuperado(error);
      throw error;
    }

    const respuesta = await adaptador.responder({ perfil, entrada });
    const validada = esquemaSalida.safeParse(respuesta.salida);

    try {
      await usos.registrar({
        en: ahora,
        perfil,
        modelo: respuesta.modelo,
        versionPrompt: respuesta.versionPrompt,
        costoMicroUsd: respuesta.costoMicroUsd,
        tokens: respuesta.tokens,
        propuesta: respuesta.salida,
        propuestaValida: validada.success,
      });
    } catch (causa) {
      throw nuevoError(
        catalogo.INF_0001,
        { motivo: "no se pudo registrar el uso de IA", perfil },
        causa,
      );
    }

    if (!validada.success) {
      throw nuevoError(catalogo.IA_0002, {
        perfil,
        modelo: respuesta.modelo,
        versionPrompt: respuesta.versionPrompt,
        problemas: validada.error.issues.map((problema) => ({
          ruta: problema.path.map(String).join("."),
          mensaje: problema.message,
        })),
      });
    }

    return {
      propuesta: validada.data,
      modelo: respuesta.modelo,
      versionPrompt: respuesta.versionPrompt,
      costoUsd: respuesta.costoMicroUsd,
      tokens: respuesta.tokens,
    };
  };
}
