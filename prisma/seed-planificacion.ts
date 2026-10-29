/**
 * La planificación de demostración (F3-02) del servicio sembrado en ejecución
 * (`SERVICIOS_DE_DEMOSTRACION` de `seed.ts`): dos hitos, uno ya realizado, y un
 * camión asignado. Las llama `sembrar` (`prisma/seed.ts`) solo fuera del
 * servidor. Textos inventados.
 *
 * Idempotente: un servicio que ya tuvo hitos o recursos (también dados de baja)
 * no recibe más.
 */

import { crearGeneradorIdCrypto } from "../src/adaptadores/memoria/generador-id.ts";
import type { PrismaClient } from "../src/adaptadores/prisma/generado/client.ts";
import {
  crearRepositorioHitosPrisma,
  crearRepositorioRecursosPrisma,
} from "../src/adaptadores/prisma/planificacion.ts";
import type { Actor } from "../src/dominio/compartido/actor.ts";
import { crearAuditable } from "../src/dominio/compartido/auditable.ts";
import { identificadorDesde } from "../src/dominio/compartido/identificador.ts";
import {
  formatearISO,
  type Reloj,
  RelojFijo,
} from "../src/dominio/compartido/reloj.ts";

const SERVICIO = {
  cuit: "30000000031",
  titulo: "Operación de tanques — ejemplo",
};

export async function sembrarPlanificacion(
  prisma: PrismaClient,
  actor: Actor,
  { reloj }: { reloj: Reloj },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const cliente = await tx.cliente.findFirst({
      where: { cuit: SERVICIO.cuit, eliminadoEn: null },
    });
    const servicio =
      cliente === null
        ? null
        : await tx.servicio.findFirst({
            where: { clienteId: cliente.id, titulo: SERVICIO.titulo },
          });
    const camion = await tx.camion.findFirst({
      where: { eliminadoEn: null },
      orderBy: { patenteTractor: "asc" },
    });
    if (
      servicio === null ||
      camion === null ||
      (await tx.servicioHito.count({ where: { servicioId: servicio.id } })) >
        0 ||
      (await tx.servicioRecurso.count({
        where: { servicioId: servicio.id },
      })) > 0
    ) {
      return;
    }
    const generadorId = crearGeneradorIdCrypto();
    const ahora = RelojFijo(reloj.ahora());
    const nuevoId = () => identificadorDesde<string>(generadorId.generar());
    const hitos = crearRepositorioHitosPrisma(tx);
    const sinRealizar = { realizadoEn: null, realizadoPor: null };
    for (const [orden, hito] of [
      {
        texto: "Entrega del informe de arranque",
        realizadoEn: formatearISO(ahora.ahora()).slice(0, 10),
        realizadoPor: actor,
      },
      { texto: "Primera revisión mensual", ...sinRealizar },
    ].entries()) {
      await hitos.crear(
        actor,
        crearAuditable(
          { id: nuevoId(), servicioId: servicio.id, orden: orden + 1, ...hito },
          actor,
          ahora,
        ),
      );
    }
    await crearRepositorioRecursosPrisma(tx).crear(
      actor,
      crearAuditable(
        {
          id: nuevoId(),
          servicioId: servicio.id,
          tipo: "camion",
          camionId: camion.id,
          descripcion: null,
          cantidad: null,
          desde: null,
          hasta: null,
        },
        actor,
        ahora,
      ),
    );
  });
}
