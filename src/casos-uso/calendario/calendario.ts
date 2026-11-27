/**
 * El calendario (F4-04, ADR 0046): lo que vence o empieza en un mes, leído de
 * cada módulo con una consulta por tipo de entrada. No guarda nada ni vuelve a
 * calcular un saldo: el de las facturas y el de los egresos es el que ya
 * calculan *Por cobrar* y *Por pagar*. Los avisos del inicio (F4-06) cuentan las
 * mismas entradas en otro tramo de días, salvo los vencimientos ya renovados
 * (F5-03): el calendario los muestra y los avisos no.
 */

import { z } from "zod";
import {
  DIAS_DE_AVISO_DE_RENOVACION,
  type EtapaDeRenovacion,
  etapaDeRenovacion,
} from "../../dominio/calendario/renovacion.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { formatearImporte } from "../../dominio/compartido/importe.ts";
import {
  type FechaHora,
  formatearISO,
  parsearISO,
  type Reloj,
  sumarDias,
} from "../../dominio/compartido/reloj.ts";
import type { LectorConfiguracion } from "../../puertos/repositorios/configuracion.ts";
import type { Rango } from "../../puertos/repositorios/tablero.ts";
import type {
  RepositoriosEnTransaccion,
  Transaccional,
} from "../../puertos/repositorios/transaccion.ts";
import { estaVencido, TODAS } from "../compartido/movimientos.ts";
import { facturasPorCobrar } from "../servicios/cobros.ts";
import { elegirMes, type MesElegido, mesDe } from "../tablero/mes.ts";
import { armarSemanas, type DiaDeLaGrilla } from "./semanas.ts";

export const TIPOS_DE_ENTRADA = [
  "vencimiento",
  "factura",
  "egreso",
  "inicio",
  "cotizacion",
] as const;

export type TipoDeEntrada = (typeof TIPOS_DE_ENTRADA)[number];

export const ETIQUETAS_DE_TIPO: Readonly<Record<TipoDeEntrada, string>> = {
  vencimiento: "Vencimientos",
  factura: "Facturas por cobrar",
  egreso: "Egresos por pagar",
  inicio: "Inicios estimados",
  cotizacion: "Cotizaciones por vencer",
};

export type EntradaDelCalendario = {
  readonly tipo: TipoDeEntrada;
  /** `aaaa-mm-dd`. */
  readonly fecha: string;
  readonly titulo: string;
  /** El saldo, si la entrada es una deuda; `null` si no. */
  readonly importe: string | null;
  /** Su fecha es anterior a hoy y sigue pendiente. */
  readonly vencida: boolean;
  readonly enlace: string;
  /** El vencimiento a cotizar como renovación; `null` si la entrada no es un vencimiento pendiente. */
  readonly vencimiento: {
    readonly id: string;
    readonly servicioId: string;
  } | null;
  /** El servicio que renovó el vencimiento; `null` si la entrada no es un vencimiento renovado. */
  readonly renovacion: {
    readonly id: string;
    readonly codigo: string;
  } | null;
  /** El responsable del servicio de la entrada; `null` si no es de un servicio (egresos). */
  readonly responsableId?: string | null;
  /** Solo en la renovación de un contrato: el aviso de 60, 45 o 30 días. */
  readonly etapaDeRenovacion?: EtapaDeRenovacion | null;
};

/** Quién mira los avisos. */
export type QuienMira = { readonly id: string; readonly rol: string };

/** Para las vistas que no son de una persona (el calendario, las marcas por servicio): ve todo. */
export const VE_TODO: QuienMira = { id: "", rol: "administrador" };

export type Calendario = {
  readonly mes: MesElegido;
  /** Los tipos que se muestran: los pedidos, o todos si no se pidió ninguno. */
  readonly tipos: readonly TipoDeEntrada[];
  /** Las del mes, por fecha. */
  readonly entradas: readonly EntradaDelCalendario[];
  readonly semanas: readonly (readonly (DiaDeLaGrilla<EntradaDelCalendario> | null)[])[];
};

/** Lo que el inicio avisa: entradas por vencer en `dias` y entradas ya vencidas. */
export type Avisos = {
  readonly dias: number;
  readonly proximos: number;
  readonly vencidos: number;
  /** El calendario del mes de hoy. */
  readonly enlace: string;
  /** Lo vencido y lo que vence en el plazo, por fecha (el «Para hoy» del inicio). */
  readonly entradas: readonly EntradaDelCalendario[];
};

export const CLAVE_DIAS_DE_AVISO = "calendario.dias_de_aviso";

/** Antes de esta fecha no hay nada cargado: el tramo de lo vencido arranca acá. */
const DESDE_SIEMPRE = "1900-01-01";

const esquemaDias = z.coerce.number().int().min(1).max(365);

export type CasosUsoCalendario = {
  /** El mes `?mes=AAAA-MM` (el del reloj si no viene) con los tipos de `?tipo=`. */
  mes(parametros: {
    readonly mes?: unknown;
    readonly tipo?: unknown;
  }): Promise<Calendario>;
  /** Cuántas entradas vencen de hoy a hoy más N días (la clave `calendario.dias_de_aviso`) y cuántas ya vencieron, de cualquier mes. */
  avisos(quien: QuienMira): Promise<Avisos>;
};

type Dependencias = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
  readonly configuracion: LectorConfiguracion;
};

function elegirTipos(pedido: unknown): readonly TipoDeEntrada[] {
  const pedidos = Array.isArray(pedido) ? pedido : [pedido];
  const elegidos = TIPOS_DE_ENTRADA.filter((tipo) => pedidos.includes(tipo));
  return elegidos.length === 0 ? TIPOS_DE_ENTRADA : elegidos;
}

/** Las entradas de los `tipos` con fecha en `rango`, por fecha. */
async function entradasEntre(
  repos: RepositoriosEnTransaccion,
  hoy: FechaHora,
  tipos: readonly TipoDeEntrada[],
  { desde, hasta }: Rango,
  conRenovados: boolean,
): Promise<EntradaDelCalendario[]> {
  const delTramo = (fecha: string) => fecha >= desde && fecha < hasta;
  const entrada = (
    datos: Omit<EntradaDelCalendario, "vencida" | "renovacion">,
  ): EntradaDelCalendario => ({
    ...datos,
    vencida: estaVencido(hoy, datos.fecha),
    renovacion: null,
  });
  const entradas: EntradaDelCalendario[] = [];
  if (tipos.includes("vencimiento")) {
    for (const v of await repos.vencimientos.pendientesEntre({
      desde,
      hasta,
    })) {
      const deContrato = v.clase === "contrato";
      entradas.push({
        ...entrada({
          tipo: "vencimiento",
          fecha: v.fecha,
          titulo: deContrato
            ? `Renovar contrato · ${v.servicioCodigo} · ${v.clienteNombre}`
            : `${v.descripcion} · ${v.servicioCodigo}`,
          importe: null,
          enlace: `/servicios/${v.servicioId}`,
          vencimiento: { id: v.id, servicioId: v.servicioId },
        }),
        responsableId: v.responsableId,
        etapaDeRenovacion: deContrato
          ? etapaDeRenovacion(diasDesde(hoy, v.fecha))
          : null,
      });
    }
    if (conRenovados) {
      for (const v of await repos.vencimientos.renovadosEntre({
        desde,
        hasta,
      })) {
        // Ya no vence: no se marca vencida ni se ofrece cotizarlo de nuevo.
        entradas.push({
          ...entrada({
            tipo: "vencimiento",
            fecha: v.fecha,
            titulo: `${v.descripcion} · ${v.servicioCodigo}`,
            importe: null,
            enlace: `/servicios/${v.servicioId}`,
            vencimiento: null,
          }),
          vencida: false,
          renovacion: v.renovacion,
        });
      }
    }
  }
  if (tipos.includes("factura")) {
    for (const {
      factura,
      cliente,
      saldo,
      responsableId,
    } of await facturasPorCobrar(repos)) {
      if (delTramo(factura.valor.vencimiento)) {
        entradas.push({
          ...entrada({
            tipo: "factura",
            fecha: factura.valor.vencimiento,
            titulo: `Factura ${factura.valor.numero} · ${cliente}`,
            importe: formatearImporte(saldo.saldo),
            enlace: `/servicios/facturas/${factura.valor.id}`,
            vencimiento: null,
          }),
          responsableId,
        });
      }
    }
  }
  if (tipos.includes("egreso")) {
    const { filas } = await repos.pagos.porPagar({
      incluirPagados: false,
      saltear: 0,
      cantidad: TODAS,
    });
    for (const fila of filas) {
      if (fila.vencimiento !== null && delTramo(fila.vencimiento)) {
        entradas.push(
          entrada({
            tipo: "egreso",
            fecha: fila.vencimiento,
            titulo: fila.concepto,
            importe: formatearImporte(fila.saldo),
            enlace: `/egresos/${fila.id}`,
            vencimiento: null,
          }),
        );
      }
    }
  }
  if (tipos.includes("inicio")) {
    for (const s of await repos.servicios.inicioEstimadoEntre({
      desde,
      hasta,
    })) {
      entradas.push({
        ...entrada({
          tipo: "inicio",
          fecha: s.fecha,
          titulo: `Inicio de ${s.codigo} · ${s.titulo}`,
          importe: null,
          enlace: `/servicios/${s.id}`,
          vencimiento: null,
        }),
        responsableId: s.responsableId,
      });
    }
  }
  if (tipos.includes("cotizacion")) {
    for (const c of await repos.servicios.cotizacionesPorVencer()) {
      const emitida = parsearISO(`${c.fecha}T00:00:00.000`);
      if (!emitida.ok) continue;
      const fecha = formatearISO(
        sumarDias(emitida.fechaHora, c.vigenciaDias),
      ).slice(0, 10);
      if (delTramo(fecha)) {
        entradas.push({
          ...entrada({
            tipo: "cotizacion",
            fecha,
            titulo: `Cotización ${c.codigo} · ${c.cliente}`,
            importe: null,
            enlace: `/servicios/${c.id}`,
            vencimiento: null,
          }),
          responsableId: c.responsableId,
        });
      }
    }
  }
  return entradas.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Los días de `hoy` a `fecha` (`aaaa-mm-dd`); negativo si ya pasó. */
function diasDesde(hoy: FechaHora, fecha: string): number {
  const dia = (texto: string) => Date.parse(`${texto.slice(0, 10)}T00:00:00Z`);
  return Math.round((dia(fecha) - dia(formatearISO(hoy))) / 86_400_000);
}

async function leerDiasDeAviso(
  configuracion: LectorConfiguracion,
): Promise<number> {
  const valor = await configuracion.leer(CLAVE_DIAS_DE_AVISO);
  const leido = esquemaDias.safeParse(valor ?? undefined);
  if (!leido.success) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "la cantidad de días de aviso no es un entero de 1 a 365",
      clave: CLAVE_DIAS_DE_AVISO,
    });
  }
  return leido.data;
}

export function crearCasosUsoCalendario({
  transaccional,
  reloj,
  configuracion,
}: Dependencias): CasosUsoCalendario {
  return {
    mes({ mes: pedido, tipo }) {
      const hoy = reloj.ahora();
      const mes = elegirMes(pedido, hoy);
      const tipos = elegirTipos(tipo);
      return transaccional.ejecutar(async (repos) => {
        const entradas = await entradasEntre(
          repos,
          hoy,
          tipos,
          mes.rango,
          true,
        );
        return {
          mes,
          tipos,
          entradas,
          semanas: armarSemanas(mes.mes, entradas),
        };
      });
    },

    async avisos(quien) {
      const hoy = reloj.ahora();
      const dias = await leerDiasDeAviso(configuracion);
      // Una sola lectura hasta el último día del aviso: lo ya vencido y lo que vence.
      // Las renovaciones de contrato avisan desde 60 días antes, aunque el plazo sea menor.
      const hastaDelPlazo = formatearISO(sumarDias(hoy, dias + 1)).slice(0, 10);
      const hasta = formatearISO(
        sumarDias(hoy, Math.max(dias, DIAS_DE_AVISO_DE_RENOVACION) + 1),
      ).slice(0, 10);
      const entradas = (
        await transaccional.ejecutar((repos) =>
          entradasEntre(
            repos,
            hoy,
            TIPOS_DE_ENTRADA,
            { desde: DESDE_SIEMPRE, hasta },
            false,
          ),
        )
      ).filter(
        (e) =>
          (e.fecha < hastaDelPlazo || e.etapaDeRenovacion != null) &&
          (quien.rol === "administrador" ||
            e.responsableId == null ||
            e.responsableId === quien.id),
      );
      const vencidos = entradas.filter(({ vencida }) => vencida).length;
      return {
        dias,
        proximos: entradas.length - vencidos,
        vencidos,
        enlace: `/calendario?mes=${mesDe(hoy)}`,
        entradas,
      };
    },
  };
}
