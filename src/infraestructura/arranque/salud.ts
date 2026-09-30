/**
 * El panel de salud armado (F0-26): conecta `listarSalud` con sus puertos
 * reales (corridas del worker, cola de fallidos, la sonda de la base y el
 * gasto de IA del mes). Lo llama `armado.ts` una vez por proceso, y la
 * memoria de las últimas pruebas exitosas de cada sonda vive con él (R6): se
 * pierde al reiniciar la app, a propósito.
 *
 * La lista de jobs sale de `JOBS` (`src/worker/jobs.ts`), la misma definición
 * que levanta el worker: un job nuevo aparece en el panel sin tocar nada acá.
 */

import { crearColaFallidosPrisma } from "../../adaptadores/prisma/cola-fallidos.ts";
import { crearLectorConfiguracion } from "../../adaptadores/prisma/configuracion.ts";
import { crearRegistroCorridasPrisma } from "../../adaptadores/prisma/corridas-worker.ts";
import type { PrismaClient } from "../../adaptadores/prisma/generado/client.ts";
import { crearSondaBase } from "../../adaptadores/prisma/sonda-base.ts";
import { crearRepositorioUsoIa } from "../../adaptadores/prisma/uso-ia.ts";
import { fechaHoraLocalDe } from "../../adaptadores/reloj/sistema.ts";
import { gastoDelMes } from "../../casos-uso/ia/gasto-del-mes.ts";
import {
  type JobDelPanel,
  listarSalud,
  memoriaDePruebasVacia,
  type Salud,
} from "../../casos-uso/salud/listar-salud.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import { JOBS, type Job } from "../../worker/jobs.ts";
import { intervaloDeCron } from "./intervalo-cron.ts";

/** Los jobs del worker con su intervalo, para que el panel mida su atraso. */
export function jobsDelPanel(jobs: readonly Job[]): readonly JobDelPanel[] {
  return jobs.map(({ nombre, cron }) => ({
    nombre,
    intervaloMs: intervaloDeCron(cron),
  }));
}

/** `listarSalud` ya armado: lo que `/salud` llama en cada pedido. */
export function armarSalud(
  prisma: PrismaClient,
  reloj: Reloj,
): () => Promise<Salud> {
  const dependencias = {
    reloj,
    aFechaHora: fechaHoraLocalDe,
    jobs: jobsDelPanel(JOBS),
    corridas: crearRegistroCorridasPrisma(prisma),
    fallidos: crearColaFallidosPrisma(prisma),
    sondas: [crearSondaBase(prisma)],
    pruebasExitosas: memoriaDePruebasVacia(),
    gastoIa: () =>
      gastoDelMes(reloj, {
        usos: crearRepositorioUsoIa(prisma),
        configuracion: crearLectorConfiguracion(prisma),
      }),
  };
  return () => listarSalud(dependencias);
}
