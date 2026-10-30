/**
 * El tablero en una sola moneda (F3-08, ADR 0042): cada documento se convierte
 * con su tipo de cambio y recién después se suma (`sumarConvertidos`). Lo que
 * no tiene tipo de cambio queda afuera de las sumas y se cuenta aparte
 * (`sinCambio`), nunca como cero en silencio.
 *
 * - *Facturado* y *egresos*: el tipo de cambio de cada factura y de cada egreso.
 * - *Cobrado* y *pagado*: el del documento que cancelan, no el del cobro o el
 *   pago, para que por cobrar = facturado − cobrado también convertido.
 * - Las barras son números para dibujar (`enUnidades`), no importes.
 */

import { z } from "zod";
import {
  crearImporte,
  formatearImporte,
  type Importe,
  type Moneda,
} from "../../dominio/compartido/importe.ts";
import type { FechaHora } from "../../dominio/compartido/reloj.ts";
import {
  restarEnMoneda,
  sumarEnMoneda,
} from "../../dominio/compartido/saldo.ts";
import {
  type MontoParaConvertir,
  sumarConvertidos,
} from "../../dominio/tablero/conversion.ts";
import type { DocumentoSinCambio } from "../../puertos/repositorios/tablero.ts";
import type { RepositoriosEnTransaccion } from "../../puertos/repositorios/transaccion.ts";
import { diaConBarras } from "../abm/definicion.ts";
import { estaVencido } from "../compartido/movimientos.ts";
import { devenga } from "./clases.ts";
import type { MesElegido } from "./mes.ts";

/** Un número y adónde lleva; `null` si no hay un listado que lo explique. */
export type Cifra = {
  readonly valor: string;
  readonly enlace: string | null;
};

export type Convertido = {
  readonly moneda: Moneda;
  readonly facturado: Cifra;
  readonly cobrado: Cifra;
  readonly egresos: Cifra;
  readonly pagado: Cifra;
  /** Cobrado menos pagado. */
  readonly resultadoDeCaja: Cifra;
  /** Facturado sin IVA menos los egresos de proyecto y de gestión administrativa. */
  readonly resultadoDevengado: Cifra;
  readonly porCobrar: Cifra;
  readonly porCobrarVencido: Cifra;
  readonly porPagar: Cifra;
  readonly porPagarVencido: Cifra;
  /** Los doce meses que terminan en el elegido. */
  readonly meses: readonly {
    readonly mes: string;
    readonly facturado: number;
    readonly egresos: number;
  }[];
  /** Resultado de siempre de los diez servicios de mayor facturación; el resto, en «Otros». */
  readonly rentabilidad: readonly {
    readonly etiqueta: string;
    readonly resultado: number;
  }[];
  /** Facturas y egresos que no entran en las sumas por no tener tipo de cambio. */
  readonly sinCambio: number;
};

/** Lo que cada pendiente aporta: su `id` para buscar su tipo de cambio, lo que falta y cuándo vence. */
export type Pendiente = {
  readonly id: string;
  readonly saldo: Importe<Moneda>;
  readonly vencimiento: string | null;
};

type Contexto = {
  readonly mes: MesElegido;
  readonly moneda: Moneda;
  readonly hoy: FechaHora;
  readonly porCobrar: readonly Pendiente[];
  readonly porPagar: readonly Pendiente[];
};

const SERVICIOS_EN_EL_GRAFICO = 10;

const enUnidades = (importe: Importe<Moneda>): number =>
  Number(importe.centavos) / 100;

/** `SRV-2031-001` se escribe `001/31`: entra bajo la barra. */
const etiquetaDe = (codigo: string): string =>
  codigo.replace(/^SRV-[0-9]{2}([0-9]{2})-(.+)$/, "$2/$1");

/** Lo facturado y lo gastado de cada servicio, en `moneda`; el resultado es lo primero menos lo segundo. */
export function resultadosPorServicio(
  moneda: Moneda,
  hoy: FechaHora,
  rentabilidad: Awaited<
    ReturnType<RepositoriosEnTransaccion["tablero"]["rentabilidadConCambio"]>
  >,
): {
  readonly servicioId: string;
  readonly codigo: string;
  readonly facturado: Importe<Moneda>;
  readonly egresos: Importe<Moneda>;
  readonly resultado: Importe<Moneda>;
}[] {
  const porServicio = new Map<
    string,
    {
      codigo: string;
      facturado: MontoParaConvertir[];
      egresos: MontoParaConvertir[];
    }
  >();
  for (const [campo, montos] of [
    ["facturado", rentabilidad.facturado],
    ["egresos", rentabilidad.egresos],
  ] as const) {
    for (const monto of montos) {
      const servicio = porServicio.get(monto.servicioId) ?? {
        codigo: monto.codigo,
        facturado: [],
        egresos: [],
      };
      servicio[campo].push(monto);
      porServicio.set(monto.servicioId, servicio);
    }
  }
  return [...porServicio].map(
    ([servicioId, { codigo, facturado: facturas, egresos: gastos }]) => {
      const facturado = sumarConvertidos(moneda, facturas, hoy);
      const egresos = sumarConvertidos(moneda, gastos, hoy);
      return {
        servicioId,
        codigo,
        facturado,
        egresos,
        resultado: restarEnMoneda(facturado, egresos),
      };
    },
  );
}

export async function armarConvertido(
  { tablero }: RepositoriosEnTransaccion,
  { mes, moneda, hoy, porCobrar, porPagar }: Contexto,
): Promise<Convertido> {
  const suma = (montos: readonly MontoParaConvertir[]) =>
    sumarConvertidos(moneda, montos, hoy);
  const cifra = (importe: Importe<Moneda>, enlace: string | null = null) => ({
    valor: formatearImporte(importe),
    enlace,
  });

  const facturadoDoceMeses = await tablero.facturadoPorMes(
    mes.rangoDeDoceMeses,
  );
  const egresosDoceMeses = await tablero.egresosPorMes(mes.rangoDeDoceMeses);
  const cobradoDelMes = suma(await tablero.cobradoConCambio(mes.rango));
  const pagadoDelMes = suma(await tablero.pagadoConCambio(mes.rango));
  const rentabilidad = await tablero.rentabilidadConCambio();
  const cambios = new Map(
    (
      await tablero.cambiosDe([...porCobrar, ...porPagar].map(({ id }) => id))
    ).map(({ id, cambio }) => [id, cambio]),
  );
  const sinCambio = (await tablero.documentosSinCambio(moneda)).length;

  const delMes = <T extends { readonly mes: string }>(filas: readonly T[]) =>
    filas.filter((fila) => fila.mes === mes.mes);
  const facturado = suma(delMes(facturadoDoceMeses));
  const egresosDelMes = delMes(egresosDoceMeses);
  const devengados = suma(egresosDelMes.filter(({ clase }) => devenga(clase)));

  const pendiente = (pendientes: readonly Pendiente[], soloVencidos: boolean) =>
    suma(
      pendientes
        .filter(
          ({ vencimiento }) =>
            !soloVencidos ||
            (vencimiento !== null && estaVencido(hoy, vencimiento)),
        )
        .map(({ id, saldo }) => ({
          importe: saldo,
          cambio: cambios.get(id) ?? null,
          cantidad: 1,
        })),
    );

  const servicios = resultadosPorServicio(moneda, hoy, rentabilidad).sort(
    (a, b) =>
      Number(b.facturado.centavos - a.facturado.centavos) ||
      a.codigo.localeCompare(b.codigo),
  );
  const resto = servicios.slice(SERVICIOS_EN_EL_GRAFICO);

  return {
    moneda,
    facturado: cifra(facturado),
    cobrado: cifra(cobradoDelMes),
    egresos: cifra(suma(egresosDelMes), `/egresos?fecha=${mes.mes}`),
    pagado: cifra(pagadoDelMes),
    resultadoDeCaja: cifra(restarEnMoneda(cobradoDelMes, pagadoDelMes)),
    resultadoDevengado: cifra(restarEnMoneda(facturado, devengados)),
    porCobrar: cifra(pendiente(porCobrar, false), "/servicios/por-cobrar"),
    porCobrarVencido: cifra(
      pendiente(porCobrar, true),
      "/servicios/por-cobrar",
    ),
    porPagar: cifra(pendiente(porPagar, false), "/egresos/pagos"),
    porPagarVencido: cifra(pendiente(porPagar, true), "/egresos/pagos"),
    meses: mes.doceMeses.map((doce) => ({
      mes: doce,
      facturado: enUnidades(
        suma(facturadoDoceMeses.filter((fila) => fila.mes === doce)),
      ),
      egresos: enUnidades(
        suma(egresosDoceMeses.filter((fila) => fila.mes === doce)),
      ),
    })),
    rentabilidad: [
      ...servicios
        .slice(0, SERVICIOS_EN_EL_GRAFICO)
        .map(({ codigo, resultado }) => ({
          etiqueta: etiquetaDe(codigo),
          resultado: enUnidades(resultado),
        })),
      ...(resto.length === 0
        ? []
        : [
            {
              etiqueta: "Otros",
              resultado: enUnidades(
                resto.reduce(
                  (total, { resultado }) => sumarEnMoneda(total, resultado),
                  crearImporte(0n, moneda),
                ),
              ),
            },
          ]),
    ],
    sinCambio,
  };
}

export type SinTipoDeCambio = {
  readonly moneda: Moneda;
  readonly orden: OrdenDeLaLista;
  readonly direccion: "asc" | "desc";
  readonly filas: readonly {
    readonly tipo: "Factura" | "Egreso";
    readonly numero: string;
    /** dd/mm/aaaa. */
    readonly fecha: string;
    readonly importe: string;
    readonly enlace: string;
  }[];
};

const esquemaOrden = z.enum(["tipo", "numero", "fecha"]).catch("fecha");
const esquemaDireccion = z.enum(["asc", "desc"]).catch("asc");

type OrdenDeLaLista = z.output<typeof esquemaOrden>;

/** La lista a la que lleva el aviso: los mismos documentos que `sinCambio` cuenta, ordenados por la columna pedida. */
export function armarSinTipoDeCambio(
  moneda: Moneda,
  documentos: readonly DocumentoSinCambio[],
  pedido: { readonly orden?: unknown; readonly direccion?: unknown },
): SinTipoDeCambio {
  const orden = esquemaOrden.parse(pedido.orden);
  const direccion = esquemaDireccion.parse(pedido.direccion);
  const signo = direccion === "asc" ? 1 : -1;
  return {
    moneda,
    orden,
    direccion,
    filas: [...documentos]
      .sort((a, b) =>
        a[orden] < b[orden] ? -signo : a[orden] > b[orden] ? signo : 0,
      )
      .map((documento) => ({
        tipo: documento.tipo === "factura" ? "Factura" : "Egreso",
        numero: documento.numero,
        fecha: diaConBarras(documento.fecha),
        importe: formatearImporte(documento.importe),
        enlace:
          documento.servicioId === null
            ? `/egresos/${documento.id}`
            : `/servicios/${documento.servicioId}`,
      })),
  };
}
