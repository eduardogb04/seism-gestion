/**
 * El puerto `Auditoria` (F0-22) con Prisma (F0-30): cada `RegistroAuditoria`
 * es una fila de `auditoria`. **Solo agrega**: el adaptador no tiene nada
 * que cambie ni quite filas, y el puerto tampoco lo declara.
 *
 * `antes` y `despues` en `null` se guardan como `NULL` de SQL (no como el
 * valor JSON `null`); el actor, como `jsonb`; `en`, como instante argentino
 * (`conversiones.ts`). Al leer (F1-05), lo que vuelve de la base se valida
 * como cualquier borde.
 */

import { z } from "zod";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../../dominio/compartido/identificador.ts";
import type { Auditoria } from "../../puertos/auditoria.ts";
import {
  actorAJson,
  actorDesdeJson,
  aFechaHora,
  aInstante,
  aJsonObjeto,
} from "./conversiones.ts";
import { Prisma } from "./generado/client.ts";

const esquemaFoto = z.record(z.string(), z.unknown()).nullable();
const esquemaFila = z.object({
  accion: z.enum(["crear", "actualizar", "eliminar"]),
  antes: esquemaFoto,
  despues: esquemaFoto,
});

/** Un `Auditoria` que escribe en `cliente` (o en la transacción que lo contiene). */
export function crearAuditoriaPrisma(
  cliente: Prisma.TransactionClient,
): Auditoria {
  return {
    async registrar(registro) {
      await cliente.auditoria.create({
        data: {
          entidad: registro.entidad,
          entidadId: registro.id,
          accion: registro.accion,
          antes:
            registro.antes === null
              ? Prisma.DbNull
              : aJsonObjeto(registro.antes),
          despues:
            registro.despues === null
              ? Prisma.DbNull
              : aJsonObjeto(registro.despues),
          actor: actorAJson(registro.actor),
          en: aInstante(registro.en),
        },
      });
    },

    async registrosDe(entidad, id) {
      const filas = await cliente.auditoria.findMany({
        where: { entidad, entidadId: id },
        orderBy: { en: "desc" },
      });
      return filas.map((fila) => {
        const leida = esquemaFila.safeParse(fila);
        if (!leida.success) {
          throw nuevoError(catalogo.INF_0001, {
            motivo:
              "la base devolvió un registro de auditoría con una forma inválida",
          });
        }
        return {
          entidad: fila.entidad,
          id: identificadorDesde<string>(fila.entidadId),
          ...leida.data,
          actor: actorDesdeJson(fila.actor),
          en: aFechaHora(fila.en),
        };
      });
    },
  };
}
