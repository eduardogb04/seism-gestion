/**
 * El puerto `Secuencias` con Postgres (F2-04, ADR 0033): una fila por prefijo
 * y año en `secuencias`. El `INSERT ... ON CONFLICT DO UPDATE` es una sola
 * sentencia: el segundo de dos escritores simultáneos espera la fila del
 * primero y se lleva el número siguiente. Dentro de una transacción, el
 * número se devuelve si la transacción se deshace: no quedan huecos.
 */

import { z } from "zod";
import type { Secuencias } from "../../puertos/secuencias.ts";
import type { Prisma } from "./generado/client.ts";

const esquemaFilas = z.tuple([z.object({ ultimo: z.number().int().min(1) })]);

/** Un `Secuencias` que escribe en `cliente` (o en la transacción que lo contiene). */
export function crearSecuenciasPrisma(
  cliente: Prisma.TransactionClient,
): Secuencias {
  return {
    async siguiente(prefijo, anio) {
      const filas = await cliente.$queryRaw`
        INSERT INTO "secuencias" ("prefijo", "anio", "ultimo")
        VALUES (${prefijo}, ${anio}, 1)
        ON CONFLICT ("prefijo", "anio")
        DO UPDATE SET "ultimo" = "secuencias"."ultimo" + 1
        RETURNING "ultimo"`;
      return esquemaFilas.parse(filas)[0].ultimo;
    },
  };
}
