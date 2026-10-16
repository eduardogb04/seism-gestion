/**
 * Dos cobros de demostración (F2-07) sobre las facturas del servicio sembrado en
 * estado vigente (`seed-ordenes-y-facturas.ts`): uno parcial en pesos, con una
 * retención, de la primera factura (en pesos), y uno en pesos, con tipo de
 * cambio, de una factura en dólares que se suma acá (la semilla de F2-06 no
 * tiene ninguna). Las llama `sembrar` (`prisma/seed.ts`) solo fuera del
 * servidor. Números y montos inventados.
 *
 * Idempotente: un servicio que ya tuvo cobros (también anulados) no recibe más,
 * ni se siembra nada si otra factura ya tiene el número de la de dólares.
 */

import { crearGeneradorIdCrypto } from "../src/adaptadores/memoria/generador-id.ts";
import { crearRepositorioCobrosPrisma } from "../src/adaptadores/prisma/cobros.ts";
import { crearRepositorioFacturasPrisma } from "../src/adaptadores/prisma/facturas.ts";
import type { PrismaClient } from "../src/adaptadores/prisma/generado/client.ts";
import type { Actor } from "../src/dominio/compartido/actor.ts";
import { crearAuditable } from "../src/dominio/compartido/auditable.ts";
import { identificadorDesde } from "../src/dominio/compartido/identificador.ts";
import { crearImporte } from "../src/dominio/compartido/importe.ts";
import { type Reloj, RelojFijo } from "../src/dominio/compartido/reloj.ts";

/** El servicio sembrado en estado vigente (`SERVICIOS_DE_DEMOSTRACION` de `seed.ts`). */
const SERVICIO = {
  cuit: "30000000031",
  titulo: "Operación de tanques — ejemplo",
};

/** La primera factura de `seed-ordenes-y-facturas.ts`: 400.000,00 sin IVA al 21 %. */
const FACTURA_EN_PESOS = "0000-00000001";

const FACTURA_EN_DOLARES = {
  numero: "0000-00000003",
  fecha: "2026-10-08",
  vencimiento: "2026-11-08",
  centavos: 1_000_000n,
  alicuota: 210,
} as const;

const CUENTA_EN_PESOS = "Banco Ejemplo Uno — cuenta corriente";

export async function sembrarCobros(
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
    const enPesos =
      servicio === null
        ? null
        : await tx.factura.findFirst({
            where: {
              servicioId: servicio.id,
              numero: FACTURA_EN_PESOS,
              eliminadoEn: null,
            },
          });
    const cuenta = await tx.cuenta.findFirst({
      where: { nombre: CUENTA_EN_PESOS, eliminadoEn: null },
    });
    if (
      servicio === null ||
      enPesos === null ||
      cuenta === null ||
      (await tx.cobro.count({
        where: { factura: { servicioId: servicio.id } },
      })) > 0 ||
      (await tx.factura.count({
        where: { numero: FACTURA_EN_DOLARES.numero },
      })) > 0
    ) {
      return;
    }
    const generadorId = crearGeneradorIdCrypto();
    const ahora = RelojFijo(reloj.ahora());
    const nuevoId = () => identificadorDesde<string>(generadorId.generar());

    const enDolaresId = nuevoId();
    await crearRepositorioFacturasPrisma(tx).crear(
      actor,
      crearAuditable(
        {
          id: enDolaresId,
          servicioId: servicio.id,
          ordenCompraId: null,
          numero: FACTURA_EN_DOLARES.numero,
          fecha: FACTURA_EN_DOLARES.fecha,
          vencimiento: FACTURA_EN_DOLARES.vencimiento,
          importe: crearImporte(FACTURA_EN_DOLARES.centavos, "USD"),
          cambio: {
            valor: { numerador: 1200n, denominador: 1n },
            fuente: "Cotización de ejemplo",
          },
          alicuota: FACTURA_EN_DOLARES.alicuota,
          documentoId: null,
        },
        actor,
        ahora,
      ),
    );

    const cobros = crearRepositorioCobrosPrisma(tx);
    await cobros.crear(
      actor,
      crearAuditable(
        {
          id: nuevoId(),
          facturaId: enPesos.id,
          fecha: "2026-10-10",
          importe: crearImporte(20_000_000n, "ARS"),
          retencion: crearImporte(800_000n, "ARS"),
          cuentaId: cuenta.id,
          entrada: crearImporte(20_000_000n, "ARS"),
          cambioValor: null,
          cambioFuente: null,
          ordenPagoNumero: "OP-0000-0001",
          ordenPagoDocumentoId: null,
          observaciones: "Primer cobro, con retención de ejemplo",
        },
        actor,
        ahora,
      ),
    );
    await cobros.crear(
      actor,
      crearAuditable(
        {
          id: nuevoId(),
          facturaId: enDolaresId,
          fecha: "2026-10-12",
          importe: crearImporte(500_000n, "USD"),
          retencion: null,
          cuentaId: cuenta.id,
          entrada: crearImporte(600_000_000n, "ARS"),
          cambioValor: { numerador: 1200n, denominador: 1n },
          cambioFuente: "Cotización de ejemplo",
          ordenPagoNumero: null,
          ordenPagoDocumentoId: null,
          observaciones: null,
        },
        actor,
        ahora,
      ),
    );
  });
}
