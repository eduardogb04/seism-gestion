import type { EstadoServicio } from "../dominio/servicios/estados.ts";
import { armado } from "../infraestructura/arranque/armado.ts";

export const ETAPAS_DEL_EMBUDO = [
  "creado",
  "cotizado",
  "adjudicado",
  "en_ejecucion",
  "finalizado",
  "cerrado",
] as const satisfies readonly EstadoServicio[];

export const NOMBRES_DE_ETAPA: Record<EstadoServicio, string> = {
  creado: "Creado",
  cotizado: "Cotizado",
  adjudicado: "Adjudicado",
  en_ejecucion: "En ejecución",
  finalizado: "Finalizado",
  cerrado: "Cerrado",
  perdido: "Perdido",
  sin_respuesta: "Sin respuesta",
  cancelado: "Cancelado",
};

export type ServicioQuieto = {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly cliente: string;
  readonly estado: EstadoServicio;
  readonly dias: number;
};

export type Embudo = {
  readonly porEtapa: Readonly<Record<EstadoServicio, number>>;
  readonly salidas: number;
  readonly quietos: readonly ServicioQuieto[];
};

/** Días sin cambio de etapa a partir de los cuales un servicio vivo se marca en «Para hoy». */
const DIAS_QUIETO = 21;
const ACTIVAS: readonly EstadoServicio[] = ["creado", "cotizado", "adjudicado"];
const UN_DIA = 86_400_000;

/** Cuántos servicios hay en cada etapa (por su último cambio) y cuáles están quietos hace rato. */
export async function embudo(): Promise<Embudo> {
  const { prisma } = armado();
  const servicios = await prisma.servicio.findMany({
    where: { eliminadoEn: null },
    select: {
      id: true,
      codigo: true,
      titulo: true,
      cliente: { select: { razonSocial: true, nombreCorto: true } },
      eventos: {
        orderBy: { posicion: "desc" },
        take: 1,
        select: { a: true, en: true },
      },
    },
  });
  const porEtapa = Object.fromEntries(
    Object.keys(NOMBRES_DE_ETAPA).map((e) => [e, 0]),
  ) as Record<EstadoServicio, number>;
  const ahora = Date.now();
  const quietos: ServicioQuieto[] = [];
  for (const s of servicios) {
    const ultimo = s.eventos[0];
    const estado = (ultimo?.a ?? "creado") as EstadoServicio;
    porEtapa[estado] = (porEtapa[estado] ?? 0) + 1;
    const dias = ultimo
      ? Math.floor((ahora - ultimo.en.getTime()) / UN_DIA)
      : 0;
    if (ACTIVAS.includes(estado) && dias >= DIAS_QUIETO) {
      quietos.push({
        id: s.id,
        codigo: s.codigo,
        titulo: s.titulo,
        cliente: s.cliente.nombreCorto ?? s.cliente.razonSocial,
        estado,
        dias,
      });
    }
  }
  return {
    porEtapa,
    salidas: porEtapa.perdido + porEtapa.sin_respuesta + porEtapa.cancelado,
    quietos: quietos.sort((a, b) => b.dias - a.dias),
  };
}
