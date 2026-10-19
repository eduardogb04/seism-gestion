/**
 * El servicio mensual de demostración (F3-03): su orden de compra en pesos, la
 * cuota inicial y un ajuste dos meses después. La llama `sembrar`
 * (`prisma/seed.ts`) solo fuera del servidor. Números y montos inventados.
 *
 * Idempotente: un servicio que ya tuvo órdenes de compra o cuotas (también
 * dadas de baja) no recibe más.
 */

import { crearGeneradorIdCrypto } from "../src/adaptadores/memoria/generador-id.ts";
import { crearRepositorioCuotasPrisma } from "../src/adaptadores/prisma/cuotas.ts";
import type { PrismaClient } from "../src/adaptadores/prisma/generado/client.ts";
import { crearRepositorioOrdenesCompraPrisma } from "../src/adaptadores/prisma/ordenes-de-compra.ts";
import type { Actor } from "../src/dominio/compartido/actor.ts";
import { crearAuditable } from "../src/dominio/compartido/auditable.ts";
import { identificadorDesde } from "../src/dominio/compartido/identificador.ts";
import { crearImporte } from "../src/dominio/compartido/importe.ts";
import { type Reloj, RelojFijo } from "../src/dominio/compartido/reloj.ts";

/** El servicio mensual sembrado en ejecución (`SERVICIOS_DE_DEMOSTRACION` de `seed.ts`). */
const SERVICIO = {
  cuit: "30000000023",
  titulo: "Alquiler mensual de tanques — ejemplo",
};

const ORDEN = {
  numero: "OC-0000-0002",
  fecha: "2026-07-20",
  centavos: 120_000_000n,
} as const;

/** La inicial primero: su mes es el de inicio. */
const CUOTAS = [
  { desdeMes: "2026-08-01", centavos: 9_000_000n },
  { desdeMes: "2026-10-01", centavos: 9_500_000n },
] as const;

export async function sembrarCuotas(
  prisma: PrismaClient,
  actor: Actor,
  reloj: Reloj,
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
    if (
      servicio === null ||
      (await tx.ordenCompra.count({ where: { servicioId: servicio.id } })) >
        0 ||
      (await tx.servicioCuota.count({ where: { servicioId: servicio.id } })) > 0
    ) {
      return;
    }
    const generadorId = crearGeneradorIdCrypto();
    const ahora = RelojFijo(reloj.ahora());
    await crearRepositorioOrdenesCompraPrisma(tx).crear(
      actor,
      crearAuditable(
        {
          id: identificadorDesde<string>(generadorId.generar()),
          servicioId: servicio.id,
          numero: ORDEN.numero,
          fecha: ORDEN.fecha,
          importe: crearImporte(ORDEN.centavos, "ARS"),
          observaciones: null,
          documentoId: null,
        },
        actor,
        ahora,
      ),
    );
    const cuotas = crearRepositorioCuotasPrisma(tx);
    for (const [posicion, cuota] of CUOTAS.entries()) {
      await cuotas.crear(
        actor,
        crearAuditable(
          {
            id: identificadorDesde<string>(generadorId.generar()),
            servicioId: servicio.id,
            posicion,
            desdeMes: cuota.desdeMes,
            importe: crearImporte(cuota.centavos, "ARS"),
          },
          actor,
          ahora,
        ),
      );
    }
  });
}
