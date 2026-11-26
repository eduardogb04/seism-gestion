"use server";

import { sesionExigida } from "../app/(auth)/sesion-actual.ts";
import { armado } from "../infraestructura/arranque/armado.ts";

export type Resultado = {
  readonly tipo: "servicio" | "cliente";
  readonly titulo: string;
  readonly detalle: string;
  readonly ruta: string;
};

/** Búsqueda global de la paleta (Ctrl K): servicios por código, título o cliente, y clientes. */
export async function buscar(texto: string): Promise<readonly Resultado[]> {
  await sesionExigida();
  const q = texto.trim();
  if (q.length < 2) return [];
  const { prisma } = armado();
  const contiene = { contains: q, mode: "insensitive" as const };
  const [servicios, clientes] = await Promise.all([
    prisma.servicio.findMany({
      where: {
        eliminadoEn: null,
        OR: [
          { codigo: contiene },
          { titulo: contiene },
          { cliente: { razonSocial: contiene } },
          { cliente: { nombreCorto: contiene } },
        ],
      },
      select: {
        id: true,
        codigo: true,
        titulo: true,
        cliente: { select: { razonSocial: true, nombreCorto: true } },
      },
      orderBy: { creadoEn: "desc" },
      take: 6,
    }),
    prisma.cliente.findMany({
      where: {
        eliminadoEn: null,
        OR: [
          { razonSocial: contiene },
          { nombreCorto: contiene },
          { cuit: { contains: q } },
        ],
      },
      select: { id: true, razonSocial: true, cuit: true, esCliente: true },
      take: 4,
    }),
  ]);
  return [
    ...servicios.map((s) => ({
      tipo: "servicio" as const,
      titulo: s.titulo,
      detalle: `${s.codigo} · ${s.cliente.nombreCorto ?? s.cliente.razonSocial}`,
      ruta: `/servicios/${s.id}`,
    })),
    ...clientes.map((c) => ({
      tipo: "cliente" as const,
      titulo: c.razonSocial,
      detalle: `CUIT ${c.cuit}${c.esCliente ? "" : " · proveedor"}`,
      ruta: `/catalogo/clientes?editar=${c.id}`,
    })),
  ];
}
