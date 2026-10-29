/**
 * Los tres listados de solo lectura a los que llevan facturado, cobrado y
 * pagado del tablero (F2-10, ADR 0038): el mes y la moneda vienen de la URL.
 * Los trae la misma condición que la suma del tablero, y el total del pie se
 * suma acá, sobre las filas que se ven. Las facturas llevan su tipo y se
 * filtran por él; la nota de crédito, en negativo (F6-03).
 */

import { z } from "zod";
import {
  formatearImporte,
  formatearMonto,
  type Importe,
  type Moneda,
} from "../../dominio/compartido/importe.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import { sumaEn } from "../../dominio/servicios/avance.ts";
import { ivaDe, totalConIva } from "../../dominio/servicios/factura.ts";
import type { FacturaDeLaLista } from "../../puertos/repositorios/tablero.ts";
import type { Transaccional } from "../../puertos/repositorios/transaccion.ts";
import { parametrosDe } from "../abm/abm.ts";
import { diaConBarras } from "../abm/definicion.ts";
import { ordenarPor } from "../compartido/orden.ts";
import { facturasPorCobrar } from "../servicios/cobros.ts";
import { tipoVisible } from "../servicios/facturas.ts";
import { elegirMes, type MesElegido } from "./mes.ts";
import { elegirMoneda } from "./moneda.ts";

type Encabezado = {
  readonly mes: MesElegido;
  readonly moneda: Moneda;
};

type Parametros = {
  readonly mes?: unknown;
  readonly moneda?: unknown;
  readonly orden?: unknown;
  readonly direccion?: unknown;
  /** Solo el listado de facturas: uno de `TIPOS_DEL_FILTRO`. */
  readonly tipo?: unknown;
};

/** Por qué se filtra el listado de facturas: la adicional es una factura, pero se elige aparte. */
const TIPOS_DEL_FILTRO = [
  "factura",
  "adicional",
  "nota_debito",
  "nota_credito",
] as const;

type TipoDelFiltro = (typeof TIPOS_DEL_FILTRO)[number];

const tipoDelFiltro = ({ tipo, adicional }: FacturaDeLaLista): TipoDelFiltro =>
  adicional ? "adicional" : tipo;

/** Las columnas por las que se ordena el listado de facturas; la primera es el orden por defecto. */
const COLUMNAS_DE_FACTURAS = ["fecha", "numero", "servicio"] as const;

export type ListadoDeFacturas = Encabezado & {
  readonly orden: (typeof COLUMNAS_DE_FACTURAS)[number];
  readonly direccion: "asc" | "desc";
  /** El tipo elegido en el filtro, o vacío: todos. */
  readonly tipo: TipoDelFiltro | "";
  /** Lo que ofrece el filtro por tipo. */
  readonly tipos: readonly {
    readonly valor: TipoDelFiltro;
    readonly etiqueta: string;
  }[];
  readonly filas: readonly {
    readonly facturaId: string;
    /** `Factura`, `Factura adicional`, `Nota de débito` o `Nota de crédito`. */
    readonly tipo: string;
    /** Todavía no se cobró entera: se le ofrece cobrar. */
    readonly conSaldo: boolean;
    readonly servicioId: string;
    readonly servicio: string;
    readonly numero: string;
    /** dd/mm/aaaa. */
    readonly fecha: string;
    readonly sinIva: string;
    readonly iva: string;
    readonly total: string;
  }[];
  readonly totalSinIva: string;
  readonly totalIva: string;
  readonly total: string;
};

export type ListadoDeCobros = Encabezado & {
  readonly filas: readonly {
    readonly servicioId: string;
    readonly factura: string;
    readonly fecha: string;
    readonly importe: string;
    /** Vacío si no hubo. */
    readonly retencion: string;
    /** Importe más retención. */
    readonly total: string;
  }[];
  readonly total: string;
};

export type ListadoDePagos = Encabezado & {
  readonly filas: readonly {
    readonly egresoId: string;
    readonly concepto: string;
    readonly fecha: string;
    readonly importe: string;
  }[];
  readonly total: string;
};

export type ListadosDelTablero = {
  /** Las facturas vigentes del mes en esa moneda, con su IVA. */
  facturas(parametros: Parametros): Promise<ListadoDeFacturas>;
  /** Los cobros vigentes del mes en esa moneda, con su retención. */
  cobros(parametros: Parametros): Promise<ListadoDeCobros>;
  /** Los pagos vigentes del mes en esa moneda. */
  pagos(parametros: Parametros): Promise<ListadoDePagos>;
};

type Dependencias = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
};

export function armarListadosDelTablero({
  transaccional,
  reloj,
}: Dependencias): ListadosDelTablero {
  function encabezado({ mes, moneda }: Parametros): Encabezado {
    return {
      mes: elegirMes(mes, reloj.ahora()),
      moneda: elegirMoneda(moneda),
    };
  }

  const sumar = (moneda: Moneda, importes: readonly Importe<Moneda>[]) =>
    formatearImporte(sumaEn(moneda, importes));

  return {
    facturas(parametros) {
      const { mes, moneda } = encabezado(parametros);
      const { orden, direccion } = parametrosDe(
        { orden: COLUMNAS_DE_FACTURAS },
        parametros,
      );
      const tipo = z
        .enum([...TIPOS_DEL_FILTRO, ""])
        .catch("")
        .parse(parametros.tipo);
      return transaccional.ejecutar(async (repos) => {
        const conSaldo = new Set<string>(
          (await facturasPorCobrar(repos)).map(
            ({ factura }) => factura.valor.id,
          ),
        );
        const filas = ordenarPor(
          (await repos.tablero.facturasDeLaLista(mes.rango, moneda)).filter(
            (factura) => tipo === "" || tipoDelFiltro(factura) === tipo,
          ),
          (factura) => factura[orden],
          direccion,
        ).map((factura) => ({
          factura,
          iva: ivaDe(factura.importe, factura.alicuota),
          total: totalConIva(factura.importe, factura.alicuota),
        }));
        return {
          mes,
          moneda,
          orden,
          direccion,
          tipo,
          tipos: TIPOS_DEL_FILTRO.map((valor) => ({
            valor,
            etiqueta: tipoVisible({
              tipo: valor === "adicional" ? "factura" : valor,
              adicional: valor === "adicional",
            }),
          })),
          filas: filas.map(({ factura, iva, total }) => ({
            facturaId: factura.id,
            tipo: tipoVisible(factura),
            conSaldo: conSaldo.has(factura.id),
            servicioId: factura.servicioId,
            servicio: factura.servicio,
            numero: factura.numero,
            fecha: diaConBarras(factura.fecha),
            sinIva: formatearMonto(factura.importe),
            iva: formatearMonto(iva),
            total: formatearMonto(total),
          })),
          totalSinIva: sumar(
            moneda,
            filas.map(({ factura }) => factura.importe),
          ),
          totalIva: sumar(
            moneda,
            filas.map(({ iva }) => iva),
          ),
          total: sumar(
            moneda,
            filas.map(({ total }) => total),
          ),
        };
      });
    },

    cobros(parametros) {
      const { mes, moneda } = encabezado(parametros);
      return transaccional.ejecutar(async (repos) => {
        const filas = (
          await repos.tablero.cobrosDeLaLista(mes.rango, moneda)
        ).map((cobro) => ({
          cobro,
          total: sumaEn(
            moneda,
            cobro.retencion === null
              ? [cobro.importe]
              : [cobro.importe, cobro.retencion],
          ),
        }));
        return {
          mes,
          moneda,
          filas: filas.map(({ cobro, total }) => ({
            servicioId: cobro.servicioId,
            factura: cobro.factura,
            fecha: diaConBarras(cobro.fecha),
            importe: formatearMonto(cobro.importe),
            retencion:
              cobro.retencion === null ? "" : formatearMonto(cobro.retencion),
            total: formatearMonto(total),
          })),
          total: sumar(
            moneda,
            filas.map(({ total }) => total),
          ),
        };
      });
    },

    pagos(parametros) {
      const { mes, moneda } = encabezado(parametros);
      return transaccional.ejecutar(async (repos) => {
        const pagos = await repos.tablero.pagosDeLaLista(mes.rango, moneda);
        return {
          mes,
          moneda,
          filas: pagos.map((pago) => ({
            egresoId: pago.egresoId,
            concepto: pago.concepto,
            fecha: diaConBarras(pago.fecha),
            importe: formatearMonto(pago.importe),
          })),
          total: sumar(
            moneda,
            pagos.map(({ importe }) => importe),
          ),
        };
      });
    },
  };
}
