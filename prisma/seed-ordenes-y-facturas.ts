/**
 * Una orden de compra y dos facturas de demostración (F2-06): sobre el servicio
 * sembrado en ejecución, una orden en pesos y dos facturas parciales
 * contra ella (con distinta alícuota); la primera con un PDF de una línea
 * generado acá, la otra sin documento. Las llama `sembrar` (`prisma/seed.ts`)
 * solo fuera del servidor. Números y montos inventados.
 *
 * Idempotente: un servicio que ya tuvo órdenes de compra (también anuladas) no
 * recibe más, ni se siembra nada si alguno de los números de factura ya lo usa
 * otra factura (el número es único). La clave del archivo sale del servicio,
 * así que un reintento pisa el mismo archivo en vez de sumar otro.
 */

import { crearGeneradorIdCrypto } from "../src/adaptadores/memoria/generador-id.ts";
import { crearRepositorioDocumentosPrisma } from "../src/adaptadores/prisma/documentos.ts";
import { crearRepositorioFacturasPrisma } from "../src/adaptadores/prisma/facturas.ts";
import type { PrismaClient } from "../src/adaptadores/prisma/generado/client.ts";
import { crearRepositorioOrdenesCompraPrisma } from "../src/adaptadores/prisma/ordenes-de-compra.ts";
import type { Actor } from "../src/dominio/compartido/actor.ts";
import { crearAuditable } from "../src/dominio/compartido/auditable.ts";
import { identificadorDesde } from "../src/dominio/compartido/identificador.ts";
import { crearImporte } from "../src/dominio/compartido/importe.ts";
import { type Reloj, RelojFijo } from "../src/dominio/compartido/reloj.ts";
import {
  type AlmacenDocumentos,
  referenciaDesde,
} from "../src/puertos/almacen-documentos.ts";
import { pdfDeUnaLinea } from "./seed-cotizaciones.ts";

/** El servicio sembrado en ejecución (`SERVICIOS_DE_DEMOSTRACION` de `seed.ts`). */
const SERVICIO = {
  cuit: "30000000031",
  titulo: "Operación de tanques — ejemplo",
};

const ORDEN = {
  numero: "OC-0000-0001",
  fecha: "2026-09-02",
  centavos: 100_000_000n,
} as const;

const FACTURAS = [
  {
    numero: "0000-00000001",
    fecha: "2026-09-30",
    vencimiento: "2026-10-30",
    centavos: 40_000_000n,
    alicuota: 210,
    conDocumento: true,
  },
  {
    numero: "0000-00000002",
    fecha: "2026-10-05",
    vencimiento: "2026-11-05",
    centavos: 25_000_000n,
    alicuota: 105,
    conDocumento: false,
  },
] as const;

export async function sembrarOrdenesYFacturas(
  prisma: PrismaClient,
  actor: Actor,
  { reloj, almacen }: { reloj: Reloj; almacen: AlmacenDocumentos },
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
      (await tx.factura.count({
        where: { numero: { in: FACTURAS.map(({ numero }) => numero) } },
      })) > 0
    ) {
      return;
    }
    const generadorId = crearGeneradorIdCrypto();
    const ahora = RelojFijo(reloj.ahora());
    const ordenId = identificadorDesde<string>(generadorId.generar());
    await crearRepositorioOrdenesCompraPrisma(tx).crear(
      actor,
      crearAuditable(
        {
          id: ordenId,
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
    const documentos = crearRepositorioDocumentosPrisma(tx);
    const facturas = crearRepositorioFacturasPrisma(tx);
    for (const factura of FACTURAS) {
      let documentoId: string | null = null;
      if (factura.conDocumento) {
        const bytes = pdfDeUnaLinea(`Factura de ejemplo ${factura.numero}`);
        const referencia = await almacen.guardar(
          referenciaDesde(`documentos/semilla/${servicio.id}-factura`),
          bytes,
          "application/pdf",
        );
        const id = identificadorDesde<string>(generadorId.generar());
        documentoId = id;
        await documentos.crear(
          actor,
          crearAuditable(
            {
              id,
              referencia,
              nombre: `factura-${factura.numero}.pdf`,
              tipoMime: "application/pdf",
              tamano: bytes.length,
            },
            actor,
            ahora,
          ),
        );
      }
      await facturas.crear(
        actor,
        crearAuditable(
          {
            id: identificadorDesde<string>(generadorId.generar()),
            servicioId: servicio.id,
            ordenCompraId: ordenId,
            numero: factura.numero,
            fecha: factura.fecha,
            vencimiento: factura.vencimiento,
            importe: crearImporte(factura.centavos, "ARS"),
            alicuota: factura.alicuota,
            documentoId,
          },
          actor,
          ahora,
        ),
      );
    }
  });
}
