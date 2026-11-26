/**
 * El listado de servicios (tablero y tabla): cada servicio con su etapa (el
 * último `ServicioEvento.a`), los días que lleva en ella, el importe que
 * cuenta (la orden de compra si hay, si no la cotización vigente) y el aviso
 * más urgente de lo que ya avisa el calendario. Se lee todo de una vez y se
 * filtra en memoria: son decenas o cientos, no miles.
 */

import { rutaDeEtapa } from "../app/servicios/[id]/rutas.ts";
import type { EntradaDelCalendario } from "../casos-uso/calendario/calendario.ts";
import {
  crearImporte,
  formatearImporte,
  type Moneda,
} from "../dominio/compartido/importe.ts";
import {
  ESTADOS_SERVICIO,
  type EstadoServicio,
} from "../dominio/servicios/estados.ts";
import { armado } from "../infraestructura/arranque/armado.ts";

export type AvisoDeServicio = {
  readonly tipo: EntradaDelCalendario["tipo"];
  /** `aaaa-mm-dd`. */
  readonly fecha: string;
  /** Qué vence, en pocas palabras: «Factura 0001-00000012», «Inicio estimado». */
  readonly que: string;
  readonly vencida: boolean;
  readonly enlace: string;
};

export type Persona = {
  readonly id: string;
  /** El nombre cargado o, si todavía no lo completó, uno armado del email. */
  readonly nombre: string;
  readonly iniciales: string;
};

export type ServicioDelListado = {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly cliente: { readonly id: string; readonly nombre: string };
  readonly tipo: { readonly id: string; readonly nombre: string };
  readonly responsable: Persona;
  readonly etapa: EstadoServicio;
  readonly dias: number;
  /** El panel de la etapa en la que está. */
  readonly enlace: string;
  /** Lo que vale: la orden de compra vigente o, si no hay, la cotización vigente. */
  readonly importe: {
    readonly moneda: Moneda;
    readonly centavos: number;
    readonly texto: string;
    readonly origen: "orden" | "cotizacion";
  } | null;
  /** Lo más urgente: lo vencido primero, después lo que vence antes. */
  readonly aviso: AvisoDeServicio | null;
};

export type Opcion = { readonly valor: string; readonly texto: string };

export type ListadoDeServicios = {
  /** Los que pasan los filtros, sin paginar ni ordenar. */
  readonly servicios: readonly ServicioDelListado[];
  readonly opciones: {
    readonly clientes: readonly Opcion[];
    readonly responsables: readonly Opcion[];
    readonly tipos: readonly Opcion[];
  };
};

export type FiltrosDeServicios = {
  readonly buscar: string;
  readonly clienteId: string;
  readonly responsableId: string;
  readonly tipoId: string;
};

const UN_DIA = 86_400_000;

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

export function filtrosDe(
  parametros: Readonly<Record<string, unknown>>,
): FiltrosDeServicios {
  return {
    buscar: texto(parametros.buscar),
    clienteId: texto(parametros.clienteId),
    responsableId: texto(parametros.responsable),
    tipoId: texto(parametros.tipo),
  };
}

export function esEstado(valor: unknown): valor is EstadoServicio {
  return (
    typeof valor === "string" &&
    (ESTADOS_SERVICIO as readonly string[]).includes(valor)
  );
}

function personaDe(usuario: {
  readonly id: string;
  readonly nombre: string | null;
  readonly email: string;
}): Persona {
  const nombre =
    usuario.nombre?.trim() ||
    (usuario.email.split("@")[0] ?? "")
      .split(/[._-]+/)
      .filter(Boolean)
      .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
      .join(" ");
  const palabras = nombre.split(/\s+/).filter(Boolean);
  const iniciales = (
    palabras.length > 1
      ? `${palabras[0]?.[0] ?? ""}${palabras.at(-1)?.[0] ?? ""}`
      : nombre.slice(0, 2)
  ).toUpperCase();
  return { id: usuario.id, nombre, iniciales };
}

const QUE: Record<EntradaDelCalendario["tipo"], (titulo: string) => string> = {
  // «Factura 0001-00000012 · Cliente»
  factura: (titulo) => titulo.split(" · ")[0] ?? "Factura",
  // «Descripción · SRV-2026-014»
  vencimiento: (titulo) => titulo.split(" · ")[0] ?? "Vencimiento",
  inicio: () => "Inicio estimado",
  egreso: (titulo) => titulo,
};

function masUrgente(a: AvisoDeServicio, b: AvisoDeServicio): AvisoDeServicio {
  if (a.vencida !== b.vencida) {
    return a.vencida ? a : b;
  }
  return a.fecha <= b.fecha ? a : b;
}

/** Los avisos del calendario (lo vencido y lo que vence en el plazo de aviso), por servicio. */
async function avisosPorServicio(): Promise<Map<string, AvisoDeServicio>> {
  const { prisma, calendario } = armado();
  const { entradas } = await calendario.avisos();
  const idDeFactura = (enlace: string) =>
    /^\/servicios\/facturas\/([0-9a-f-]{36})$/.exec(enlace)?.[1];
  const facturas = entradas.flatMap((e) => {
    const id = e.tipo === "factura" ? idDeFactura(e.enlace) : undefined;
    return id === undefined ? [] : [id];
  });
  const servicioDeFactura = new Map(
    facturas.length === 0
      ? []
      : (
          await prisma.factura.findMany({
            where: { id: { in: facturas } },
            select: { id: true, servicioId: true },
          })
        ).map(({ id, servicioId }) => [id, servicioId]),
  );
  const porServicio = new Map<string, AvisoDeServicio>();
  for (const entrada of entradas) {
    const servicioId =
      entrada.tipo === "vencimiento"
        ? entrada.vencimiento?.servicioId
        : entrada.tipo === "factura"
          ? servicioDeFactura.get(idDeFactura(entrada.enlace) ?? "")
          : entrada.tipo === "inicio"
            ? /^\/servicios\/([0-9a-f-]{36})$/.exec(entrada.enlace)?.[1]
            : undefined;
    if (servicioId === undefined) {
      continue;
    }
    const aviso: AvisoDeServicio = {
      tipo: entrada.tipo,
      fecha: entrada.fecha,
      que: QUE[entrada.tipo](entrada.titulo),
      vencida: entrada.vencida,
      enlace: entrada.enlace,
    };
    const otro = porServicio.get(servicioId);
    porServicio.set(servicioId, otro ? masUrgente(otro, aviso) : aviso);
  }
  return porServicio;
}

function contiene(texto: string, buscado: string): boolean {
  return texto
    .toLocaleLowerCase("es")
    .includes(buscado.toLocaleLowerCase("es"));
}

function opcionesDe(
  pares: readonly { readonly id: string; readonly nombre: string }[],
): Opcion[] {
  const unicos = new Map(pares.map(({ id, nombre }) => [id, nombre]));
  return [...unicos]
    .map(([valor, texto]) => ({ valor, texto }))
    .sort((a, b) => a.texto.localeCompare(b.texto, "es"));
}

/** Todos los servicios vigentes que pasan los filtros, listos para el tablero o la tabla. */
export async function listadoDeServicios(
  filtros: FiltrosDeServicios,
): Promise<ListadoDeServicios> {
  const { prisma } = armado();
  const [filas, avisos] = await Promise.all([
    prisma.servicio.findMany({
      where: { eliminadoEn: null },
      select: {
        id: true,
        codigo: true,
        titulo: true,
        cliente: {
          select: { id: true, razonSocial: true, nombreCorto: true },
        },
        tipoServicio: { select: { id: true, nombre: true } },
        responsable: { select: { id: true, nombre: true, email: true } },
        eventos: {
          orderBy: { posicion: "desc" },
          take: 1,
          select: { a: true, en: true },
        },
        cotizaciones: {
          where: { eliminadoEn: null },
          orderBy: { version: "desc" },
          take: 1,
          select: { importeCentavos: true, importeMoneda: true },
        },
        ordenesCompra: {
          where: { eliminadoEn: null },
          orderBy: { fecha: "desc" },
          take: 1,
          select: { importeCentavos: true, importeMoneda: true },
        },
      },
    }),
    avisosPorServicio(),
  ]);
  const ahora = Date.now();
  const todos: ServicioDelListado[] = filas.map((s) => {
    const ultimo = s.eventos[0];
    const etapa = esEstado(ultimo?.a) ? ultimo.a : "creado";
    const orden = s.ordenesCompra[0];
    const cotizacion = s.cotizaciones[0];
    const base = orden ?? cotizacion;
    const moneda = base?.importeMoneda as Moneda | undefined;
    return {
      id: s.id,
      codigo: s.codigo,
      titulo: s.titulo,
      cliente: {
        id: s.cliente.id,
        nombre: s.cliente.nombreCorto ?? s.cliente.razonSocial,
      },
      tipo: { id: s.tipoServicio.id, nombre: s.tipoServicio.nombre },
      responsable: personaDe(s.responsable),
      etapa,
      dias: ultimo ? Math.floor((ahora - ultimo.en.getTime()) / UN_DIA) : 0,
      enlace: rutaDeEtapa(s.id, etapa),
      importe:
        base === undefined || moneda === undefined
          ? null
          : {
              moneda,
              centavos: Number(base.importeCentavos),
              texto: formatearImporte(
                crearImporte(base.importeCentavos, moneda),
              ),
              origen: orden ? "orden" : "cotizacion",
            },
      aviso: avisos.get(s.id) ?? null,
    };
  });
  const servicios = todos.filter(
    (s) =>
      (filtros.buscar === "" ||
        contiene(s.codigo, filtros.buscar) ||
        contiene(s.titulo, filtros.buscar) ||
        contiene(s.cliente.nombre, filtros.buscar)) &&
      (filtros.clienteId === "" || s.cliente.id === filtros.clienteId) &&
      (filtros.responsableId === "" ||
        s.responsable.id === filtros.responsableId) &&
      (filtros.tipoId === "" || s.tipo.id === filtros.tipoId),
  );
  return {
    servicios,
    opciones: {
      clientes: opcionesDe(todos.map((s) => s.cliente)),
      responsables: opcionesDe(todos.map((s) => s.responsable)),
      tipos: opcionesDe(todos.map((s) => s.tipo)),
    },
  };
}

/** La suma de importes por moneda, sin convertir nada: una línea por moneda. */
export function totalesPorMoneda(
  servicios: readonly ServicioDelListado[],
): readonly string[] {
  const porMoneda = new Map<Moneda, bigint>();
  for (const { importe } of servicios) {
    if (importe !== null) {
      porMoneda.set(
        importe.moneda,
        (porMoneda.get(importe.moneda) ?? 0n) + BigInt(importe.centavos),
      );
    }
  }
  return [...porMoneda]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([moneda, centavos]) =>
      formatearImporte(crearImporte(centavos, moneda)),
    );
}
