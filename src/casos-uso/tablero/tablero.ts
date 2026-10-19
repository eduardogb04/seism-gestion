/**
 * El tablero de inicio (F2-10, ADR 0038): cuánto entra y cuánto sale, por mes
 * y por moneda, sin mezclar ni convertir. Las sumas las hace la base
 * (`RepositorioTablero`); acá solo se arman, se restan y se escriben.
 *
 * - *Facturado*, *cobrado* y *pagado* son del mes elegido. *Pendiente* es a la
 *   fecha del reloj, y la rentabilidad por servicio es de siempre.
 * - *Pendiente de cobro* sale de `facturasPorCobrar` y *de pago* de
 *   `pagos.porPagar`: las mismas consultas que las pantallas que lo listan.
 * - Cada cifra lleva el enlace a su listado; las que son una resta de otras
 *   no tienen listado propio y no llevan enlace.
 * - Lo que se muestra sale ya escrito: `app` no importa el dominio salvo por tipos.
 */

import {
  formatearImporte,
  MONEDAS,
  type Moneda,
  multiplicar,
} from "../../dominio/compartido/importe.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import { restarEnMoneda } from "../../dominio/compartido/saldo.ts";
import { sumaEn } from "../../dominio/servicios/avance.ts";
import { ivaDe } from "../../dominio/servicios/factura.ts";
import type { ClaseDeCentro } from "../../puertos/repositorios/tablero.ts";
import type { Transaccional } from "../../puertos/repositorios/transaccion.ts";
import { textoDeServicio } from "../abm/definicion.ts";
import { estaVencido, TODAS } from "../compartido/movimientos.ts";
import { facturasPorCobrar } from "../servicios/cobros.ts";
import { CLASES, devenga } from "./clases.ts";
import {
  armarConvertido,
  armarSinTipoDeCambio,
  type Cifra,
  type Convertido,
  type SinTipoDeCambio,
} from "./convertido.ts";
import {
  armarListadosDelTablero,
  type ListadosDelTablero,
} from "./listados.ts";
import { elegirMes, type MesElegido } from "./mes.ts";
import { elegirMoneda } from "./moneda.ts";

export type MesEnMoneda = {
  readonly moneda: Moneda;
  readonly facturadoSinIva: Cifra;
  readonly facturadoConIva: Cifra;
  readonly cobrado: Cifra;
  /** De todas las clases de centro de costo. */
  readonly egresos: Cifra;
  readonly pagado: Cifra;
  /** Cobrado menos pagado. */
  readonly resultadoDeCaja: Cifra;
  /** Facturado sin IVA menos los egresos de proyecto y de gestión administrativa. */
  readonly resultadoDevengado: Cifra;
};

export type PendienteEnMoneda = {
  readonly moneda: Moneda;
  readonly porCobrar: Cifra;
  readonly porCobrarVencido: Cifra;
  readonly porPagar: Cifra;
  readonly porPagarVencido: Cifra;
};

export type RentabilidadDeUnServicio = {
  readonly moneda: Moneda;
  /** `SRV-2026-014 · Título`. */
  readonly servicio: string;
  readonly enlace: string;
  readonly facturado: string;
  readonly egresos: string;
  readonly resultado: string;
};

export type BloqueDeClase = {
  readonly clase: ClaseDeCentro;
  readonly nombre: string;
  readonly centros: readonly {
    readonly nombre: string;
    readonly total: Cifra;
  }[];
  readonly subtotal: string;
};

export type EgresosDeUnaMoneda = {
  readonly moneda: Moneda;
  /** Siempre los tres, en este orden. */
  readonly bloques: readonly BloqueDeClase[];
};

export type Tablero = {
  readonly mes: MesElegido;
  readonly delMes: readonly MesEnMoneda[];
  readonly pendientes: readonly PendienteEnMoneda[];
  readonly rentabilidad: readonly RentabilidadDeUnServicio[];
  readonly egresosPorCentro: readonly EgresosDeUnaMoneda[];
  /** Todo en la moneda elegida, convirtiendo cada documento con su tipo de cambio. */
  readonly convertido: Convertido;
};

export type CasosUsoTablero = {
  /**
   * `mes`: lo que trajo la URL (`AAAA-MM`); si no sirve, el mes del reloj.
   * `moneda`: `ARS` o `USD`; si no sirve, pesos.
   */
  tablero(parametros: {
    readonly mes?: unknown;
    readonly moneda?: unknown;
  }): Promise<Tablero>;
  /** Las facturas y los egresos que no se pueden mirar en esa moneda por falta de tipo de cambio. */
  sinTipoDeCambio(parametros: {
    readonly moneda?: unknown;
    readonly orden?: unknown;
    readonly direccion?: unknown;
  }): Promise<SinTipoDeCambio>;
  readonly listados: ListadosDelTablero;
};

type Dependencias = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
};

function listado(ruta: string, { mes }: MesElegido, moneda: Moneda): string {
  return `${ruta}?${new URLSearchParams({ mes, moneda })}`;
}

export function crearCasosUsoTablero({
  transaccional,
  reloj,
}: Dependencias): CasosUsoTablero {
  return {
    listados: armarListadosDelTablero({ transaccional, reloj }),

    sinTipoDeCambio(parametros) {
      const moneda = elegirMoneda(parametros.moneda);
      return transaccional.ejecutar(async ({ tablero }) =>
        armarSinTipoDeCambio(
          moneda,
          await tablero.documentosSinCambio(moneda),
          parametros,
        ),
      );
    },

    tablero(parametros) {
      const hoy = reloj.ahora();
      const mes = elegirMes(parametros.mes, hoy);
      const monedaElegida = elegirMoneda(parametros.moneda);
      return transaccional.ejecutar(async (repos) => {
        const { tablero } = repos;
        const facturas = await tablero.facturasDelRango(mes.rango);
        const cobrado = await tablero.cobradoEnElRango(mes.rango);
        const pagado = await tablero.pagadoEnElRango(mes.rango);
        const centros = await tablero.egresosPorCentro(mes.rango);
        const rentabilidad = await tablero.rentabilidadPorServicio();
        const porCobrar = await facturasPorCobrar(repos);
        const porPagar = await repos.pagos.porPagar({
          incluirPagados: false,
          saltear: 0,
          cantidad: TODAS,
        });

        const sinIva = facturas.map(({ suma }) => suma);
        const iva = facturas.map(({ importe, alicuota, cantidad }) =>
          multiplicar(ivaDe(importe, alicuota), BigInt(cantidad)),
        );
        const egresosDe = (moneda: Moneda) =>
          centros.filter(({ total }) => total.moneda === moneda);

        const delMes = MONEDAS.filter(
          (moneda) =>
            [...sinIva, ...cobrado, ...pagado].some(
              (importe) => importe.moneda === moneda,
            ) || egresosDe(moneda).length > 0,
        ).map((moneda): MesEnMoneda => {
          const facturado = sumaEn(moneda, sinIva);
          const egresos = sumaEn(
            moneda,
            egresosDe(moneda).map(({ total }) => total),
          );
          const devengados = sumaEn(
            moneda,
            egresosDe(moneda)
              .filter(({ clase }) => devenga(clase))
              .map(({ total }) => total),
          );
          const cobradoEnMoneda = sumaEn(moneda, cobrado);
          const pagadoEnMoneda = sumaEn(moneda, pagado);
          return {
            moneda,
            facturadoSinIva: {
              valor: formatearImporte(facturado),
              enlace: listado("/servicios/facturas", mes, moneda),
            },
            facturadoConIva: {
              valor: formatearImporte(sumaEn(moneda, [...sinIva, ...iva])),
              enlace: listado("/servicios/facturas", mes, moneda),
            },
            cobrado: {
              valor: formatearImporte(cobradoEnMoneda),
              enlace: listado("/servicios/cobros", mes, moneda),
            },
            egresos: {
              valor: formatearImporte(egresos),
              enlace: `/egresos?${new URLSearchParams({ fecha: mes.mes })}`,
            },
            pagado: {
              valor: formatearImporte(pagadoEnMoneda),
              enlace: listado("/egresos/pagos-hechos", mes, moneda),
            },
            resultadoDeCaja: {
              valor: formatearImporte(
                restarEnMoneda(cobradoEnMoneda, pagadoEnMoneda),
              ),
              enlace: null,
            },
            resultadoDevengado: {
              valor: formatearImporte(restarEnMoneda(facturado, devengados)),
              enlace: null,
            },
          };
        });

        const cobroDe = (moneda: Moneda) =>
          porCobrar.filter(({ saldo }) => saldo.saldo.moneda === moneda);
        const pagoDe = (moneda: Moneda) =>
          porPagar.filas.filter(({ saldo }) => saldo.moneda === moneda);
        const pendientes = MONEDAS.filter(
          (moneda) => cobroDe(moneda).length > 0 || pagoDe(moneda).length > 0,
        ).map((moneda): PendienteEnMoneda => {
          const cobroPendiente = cobroDe(moneda).map(
            ({ saldo }) => saldo.saldo,
          );
          const cobroVencido = cobroDe(moneda)
            .filter(({ factura }) =>
              estaVencido(hoy, factura.valor.vencimiento),
            )
            .map(({ saldo }) => saldo.saldo);
          const pagoVencido = pagoDe(moneda)
            .filter(
              ({ vencimiento }) =>
                vencimiento !== null && estaVencido(hoy, vencimiento),
            )
            .map(({ saldo }) => saldo);
          return {
            moneda,
            porCobrar: {
              valor: formatearImporte(sumaEn(moneda, cobroPendiente)),
              enlace: "/servicios/por-cobrar",
            },
            porCobrarVencido: {
              valor: formatearImporte(sumaEn(moneda, cobroVencido)),
              enlace: "/servicios/por-cobrar",
            },
            porPagar: {
              valor: formatearImporte(sumaEn(moneda, porPagar.saldos)),
              enlace: "/egresos/pagos",
            },
            porPagarVencido: {
              valor: formatearImporte(sumaEn(moneda, pagoVencido)),
              enlace: "/egresos/pagos",
            },
          };
        });

        return {
          mes,
          delMes,
          pendientes,
          rentabilidad: rentabilidad.map(
            ({ servicioId, codigo, titulo, facturado, egresos }) => ({
              moneda: facturado.moneda,
              servicio: textoDeServicio(codigo, titulo),
              enlace: `/servicios/${servicioId}`,
              facturado: formatearImporte(facturado),
              egresos: formatearImporte(egresos),
              resultado: formatearImporte(restarEnMoneda(facturado, egresos)),
            }),
          ),
          convertido: await armarConvertido(repos, {
            mes,
            moneda: monedaElegida,
            hoy,
            porCobrar: porCobrar.map(({ factura, saldo }) => ({
              id: factura.valor.id,
              saldo: saldo.saldo,
              vencimiento: factura.valor.vencimiento,
            })),
            porPagar: porPagar.filas.map(({ id, saldo, vencimiento }) => ({
              id,
              saldo,
              vencimiento,
            })),
          }),
          egresosPorCentro: MONEDAS.filter(
            (moneda) => egresosDe(moneda).length > 0,
          ).map(
            (moneda): EgresosDeUnaMoneda => ({
              moneda,
              bloques: CLASES.map(({ clase, nombre }) => {
                const delBloque = egresosDe(moneda).filter(
                  (centro) => centro.clase === clase,
                );
                return {
                  clase,
                  nombre,
                  centros: delBloque.map(({ centroId, centro, total }) => ({
                    nombre: centro,
                    total: {
                      valor: formatearImporte(total),
                      enlace: `/egresos?${new URLSearchParams({ fecha: mes.mes, centroCostoId: centroId })}`,
                    },
                  })),
                  subtotal: formatearImporte(
                    sumaEn(
                      moneda,
                      delBloque.map(({ total }) => total),
                    ),
                  ),
                };
              }),
            }),
          ),
        };
      });
    },
  };
}
