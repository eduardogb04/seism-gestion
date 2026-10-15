/**
 * Las cotizaciones de demostración (F2-05): sobre un servicio ya sembrado,
 * dos versiones (la segunda con su motivo), cada una con un PDF de una línea
 * generado acá —bytes mínimos y texto genérico, ningún archivo real— y
 * guardado por el almacén. Las llama `sembrar` (`prisma/seed.ts`) solo fuera
 * del servidor.
 *
 * Idempotente: un servicio que ya tuvo cotizaciones (también anuladas) no
 * recibe más, y la clave del archivo sale del servicio y la versión, así que un
 * reintento pisa el mismo archivo en vez de sumar otro.
 */

import { crearGeneradorIdCrypto } from "../src/adaptadores/memoria/generador-id.ts";
import { crearRepositorioCotizacionesPrisma } from "../src/adaptadores/prisma/cotizaciones.ts";
import { crearRepositorioDocumentosPrisma } from "../src/adaptadores/prisma/documentos.ts";
import type { PrismaClient } from "../src/adaptadores/prisma/generado/client.ts";
import type { Actor } from "../src/dominio/compartido/actor.ts";
import { crearAuditable } from "../src/dominio/compartido/auditable.ts";
import { identificadorDesde } from "../src/dominio/compartido/identificador.ts";
import { crearImporte } from "../src/dominio/compartido/importe.ts";
import { type Reloj, RelojFijo } from "../src/dominio/compartido/reloj.ts";
import {
  type AlmacenDocumentos,
  referenciaDesde,
} from "../src/puertos/almacen-documentos.ts";

/** El servicio sembrado en estado cotizado (`SERVICIOS_DE_DEMOSTRACION` de `seed.ts`). */
const SERVICIO = {
  cuit: "30000000023",
  titulo: "Certificación de camiones — ejemplo",
};

/** Montos redondos inventados. */
const COTIZACIONES = [
  {
    version: 1,
    fecha: "2026-09-18",
    centavos: 125_000_000n,
    motivo: null,
  },
  {
    version: 2,
    fecha: "2026-09-24",
    centavos: 118_000_000n,
    motivo: "Ajuste de alcance acordado con el cliente de ejemplo",
  },
] as const;

/** Un PDF de una página con una línea de texto, con su tabla de referencias cruzadas. */
function pdfDeUnaLinea(texto: string): Uint8Array {
  const flujo = `BT /F1 12 Tf 20 50 Td (${texto}) Tj ET`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const desplazamientos: number[] = [];
  let cuerpo = "%PDF-1.4\n";
  for (const [posicion, objeto] of objetos.entries()) {
    desplazamientos.push(cuerpo.length);
    cuerpo += `${posicion + 1} 0 obj\n${objeto}\nendobj\n`;
  }
  const referencias = desplazamientos
    .map(
      (desplazamiento) =>
        `${String(desplazamiento).padStart(10, "0")} 00000 n \n`,
    )
    .join("");
  const inicio = cuerpo.length;
  cuerpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${referencias}`;
  cuerpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicio}\n%%EOF\n`;
  return new TextEncoder().encode(cuerpo);
}

export async function sembrarCotizaciones(
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
      (await tx.cotizacion.count({ where: { servicioId: servicio.id } })) > 0
    ) {
      return;
    }
    const documentos = crearRepositorioDocumentosPrisma(tx);
    const cotizaciones = crearRepositorioCotizacionesPrisma(tx);
    const generadorId = crearGeneradorIdCrypto();
    const ahora = RelojFijo(reloj.ahora());
    for (const { version, fecha, centavos, motivo } of COTIZACIONES) {
      const bytes = pdfDeUnaLinea(`Cotizacion de ejemplo - version ${version}`);
      const referencia = await almacen.guardar(
        referenciaDesde(`documentos/semilla/${servicio.id}-v${version}`),
        bytes,
        "application/pdf",
      );
      const documentoId = identificadorDesde<string>(generadorId.generar());
      await documentos.crear(
        actor,
        crearAuditable(
          {
            id: documentoId,
            referencia,
            nombre: `cotizacion-v${version}.pdf`,
            tipoMime: "application/pdf",
            tamano: bytes.length,
          },
          actor,
          ahora,
        ),
      );
      await cotizaciones.crear(
        actor,
        crearAuditable(
          {
            id: identificadorDesde<string>(generadorId.generar()),
            servicioId: servicio.id,
            version,
            fecha,
            importe: crearImporte(centavos, "ARS"),
            motivo,
            observaciones: null,
            documentoId,
          },
          actor,
          ahora,
        ),
      );
    }
  });
}
