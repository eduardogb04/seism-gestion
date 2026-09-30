/**
 * El puerto `Auditoria` (F0-22) con Prisma (F0-30): cada `RegistroAuditoria`
 * es una fila de `auditoria`. **Solo agrega**: el adaptador no tiene nada
 * que cambie ni quite filas, y el puerto tampoco lo declara.
 *
 * `antes` y `despues` en `null` se guardan como `NULL` de SQL (no como el
 * valor JSON `null`); el actor, como `jsonb`; `en`, como instante argentino
 * (`conversiones.ts`).
 */

import type { Auditoria } from "../../puertos/auditoria.ts";
import { actorAJson, aInstante, aJsonObjeto } from "./conversiones.ts";
import { Prisma } from "./generado/client.ts";

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
  };
}
