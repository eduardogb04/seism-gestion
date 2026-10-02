/**
 * `RepositorioServicios` con Prisma (F2-04, ADR 0033). La fila se lee y se
 * escribe con lo mismo que la de un ABM (`crearEscrituraPrisma`, con su
 * auditoría); el listado, los eventos de estado y los sitios son propios.
 */

import { z } from "zod";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../../dominio/compartido/identificador.ts";
import {
  ESTADOS_SERVICIO,
  type EstadoServicio,
} from "../../dominio/servicios/estados.ts";
import type {
  DatosServicio,
  RepositorioServicios,
} from "../../puertos/repositorios/servicios.ts";
import { aDia, deDia } from "./abm/egresos.ts";
import { crearEscrituraPrisma } from "./abm/repositorio.ts";
import { crearAuditoriaPrisma } from "./auditoria.ts";
import {
  actorAJson,
  actorDesdeJson,
  aFechaHora,
  aInstante,
} from "./conversiones.ts";
import { Prisma } from "./generado/client.ts";

/** Código de Prisma para una violación de clave única. */
const VIOLACION_UNICO = "P2002";

const ENTIDAD = "Servicio";

const esquemaEstado = z.enum(ESTADOS_SERVICIO);
const esquemaIds = z.array(z.object({ id: z.string() }));

function estadoDe(texto: string | undefined): EstadoServicio {
  const leido = esquemaEstado.safeParse(texto);
  if (!leido.success) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "la base devolvió un servicio con un estado desconocido",
    });
  }
  return leido.data;
}

function diaONada(fecha: Date | null): string | null {
  return fecha === null ? null : aDia(fecha);
}

function fechaONada(dia: string | null): Date | null {
  return dia === null ? null : deDia(dia);
}

/** Los ids de los servicios cuyo último evento los dejó en `estado`. */
async function idsEnEstado(
  cliente: Prisma.TransactionClient,
  estado: EstadoServicio,
): Promise<string[]> {
  const filas = await cliente.$queryRaw`
    SELECT e."servicio_id"::text AS "id"
    FROM "servicios_eventos" e
    WHERE e."a" = ${estado}
      AND e."posicion" = (
        SELECT max(u."posicion")
        FROM "servicios_eventos" u
        WHERE u."servicio_id" = e."servicio_id"
      )`;
  return esquemaIds.parse(filas).map(({ id }) => id);
}

/** Un `RepositorioServicios` en la transacción de `cliente`. */
export function crearRepositorioServiciosPrisma(
  cliente: Prisma.TransactionClient,
): RepositorioServicios {
  const auditoria = crearAuditoriaPrisma(cliente);

  async function sitiosDe(id: string): Promise<string[]> {
    const filas = await cliente.servicioSitio.findMany({
      where: { servicioId: id },
      orderBy: { sitioId: "asc" },
    });
    return filas.map(({ sitioId }) => sitioId);
  }

  return {
    ...crearEscrituraPrisma<Prisma.ServicioGetPayload<object>, DatosServicio>(
      cliente,
      ENTIDAD,
      cliente.servicio,
      {
        aDatos: ({ fechaPedido, vigenciaDesde, vigenciaHasta, ...resto }) => ({
          ...resto,
          fechaPedido: aDia(fechaPedido),
          vigenciaDesde: diaONada(vigenciaDesde),
          vigenciaHasta: diaONada(vigenciaHasta),
        }),
        aFila: ({ fechaPedido, vigenciaDesde, vigenciaHasta, ...resto }) => ({
          ...resto,
          fechaPedido: deDia(fechaPedido),
          vigenciaDesde: fechaONada(vigenciaDesde),
          vigenciaHasta: fechaONada(vigenciaHasta),
        }),
      },
    ),

    async listar({
      buscar,
      estado,
      clienteId,
      orden,
      direccion,
      saltear,
      cantidad,
    }) {
      const contiene = { contains: buscar, mode: "insensitive" } as const;
      const where: Prisma.ServicioWhereInput = {
        eliminadoEn: null,
        ...(buscar === ""
          ? {}
          : {
              OR: [
                { codigo: contiene },
                { titulo: contiene },
                { cliente: { razonSocial: contiene } },
              ],
            }),
        ...(clienteId === null ? {} : { clienteId }),
        ...(estado === null
          ? {}
          : { id: { in: await idsEnEstado(cliente, estado) } }),
      };
      const filas = await cliente.servicio.findMany({
        where,
        // El `id` desempata: sin él, dos filas con el mismo valor pueden cambiar de página.
        orderBy: [
          orden === "codigo"
            ? { codigo: direccion }
            : { fechaPedido: direccion },
          { id: "asc" },
        ],
        skip: saltear,
        take: cantidad,
        include: {
          cliente: true,
          tipoServicio: true,
          responsable: true,
          eventos: { orderBy: { posicion: "desc" }, take: 1 },
        },
      });
      return {
        filas: filas.map((fila) => ({
          id: fila.id,
          codigo: fila.codigo,
          titulo: fila.titulo,
          cliente: fila.cliente.razonSocial,
          tipo: fila.tipoServicio.nombre,
          estado: estadoDe(fila.eventos[0]?.a),
          responsable: fila.responsable.email,
          fechaPedido: aDia(fila.fechaPedido),
        })),
        total: await cliente.servicio.count({ where }),
      };
    },

    async eventosDe(id) {
      const filas = await cliente.servicioEvento.findMany({
        where: { servicioId: id },
        orderBy: { posicion: "asc" },
      });
      return filas.map(({ de, a, en, actor, nota }) => ({
        de: de === null ? null : estadoDe(de),
        a: estadoDe(a),
        en: aFechaHora(en),
        actor: actorDesdeJson(actor),
        origen: nota,
      }));
    },

    async agregarEvento(actor, id, { posicion, de, a, en, origen }) {
      try {
        await cliente.servicioEvento.create({
          data: {
            servicioId: id,
            posicion,
            de,
            a,
            en: aInstante(en),
            actor: actorAJson(actor),
            nota: origen,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === VIOLACION_UNICO
        ) {
          throw nuevoError(catalogo.DOM_0011, { id, de, a }, error);
        }
        throw error;
      }
    },

    sitiosDe,

    async guardarSitios(actor, id, sitioIds, en) {
      const antes = await sitiosDe(id);
      await cliente.servicioSitio.deleteMany({ where: { servicioId: id } });
      await cliente.servicioSitio.createMany({
        data: sitioIds.map((sitioId) => ({ servicioId: id, sitioId })),
      });
      await auditoria.registrar({
        entidad: ENTIDAD,
        id: identificadorDesde<string>(id),
        accion: "actualizar",
        antes: { sitios: antes },
        despues: { sitios: await sitiosDe(id) },
        actor,
        en,
      });
    },

    async usa(entidad, id) {
      const donde: Prisma.ServicioWhereInput | null =
        entidad === "Cliente"
          ? { clienteId: id }
          : entidad === "TipoServicio"
            ? { tipoServicioId: id }
            : entidad === "Sitio"
              ? { sitios: { some: { sitioId: id } } }
              : null;
      return (
        donde !== null &&
        (await cliente.servicio.findFirst({
          where: { eliminadoEn: null, ...donde },
        })) !== null
      );
    },
  };
}
