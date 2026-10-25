/**
 * El calendario (F4-04, ADR 0046): lo que vence o empieza en un mes, leído de
 * cada módulo con una consulta por tipo de entrada. No guarda nada ni vuelve a
 * calcular un saldo: el de las facturas y el de los egresos es el que ya
 * calculan *Por cobrar* y *Por pagar*.
 */

import { formatearImporte } from "../../dominio/compartido/importe.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import type { Transaccional } from "../../puertos/repositorios/transaccion.ts";
import { estaVencido, TODAS } from "../compartido/movimientos.ts";
import { facturasPorCobrar } from "../servicios/cobros.ts";
import { elegirMes, type MesElegido } from "../tablero/mes.ts";
import { armarSemanas, type DiaDeLaGrilla } from "./semanas.ts";

export const TIPOS_DE_ENTRADA = [
  "vencimiento",
  "factura",
  "egreso",
  "inicio",
] as const;

export type TipoDeEntrada = (typeof TIPOS_DE_ENTRADA)[number];

export const ETIQUETAS_DE_TIPO: Readonly<Record<TipoDeEntrada, string>> = {
  vencimiento: "Vencimientos",
  factura: "Facturas por cobrar",
  egreso: "Egresos por pagar",
  inicio: "Inicios estimados",
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
};

export type Calendario = {
  readonly mes: MesElegido;
  /** Los tipos que se muestran: los pedidos, o todos si no se pidió ninguno. */
  readonly tipos: readonly TipoDeEntrada[];
  /** Las del mes, por fecha. */
  readonly entradas: readonly EntradaDelCalendario[];
  readonly semanas: readonly (readonly (DiaDeLaGrilla<EntradaDelCalendario> | null)[])[];
};

export type CasosUsoCalendario = {
  /** El mes `?mes=AAAA-MM` (el del reloj si no viene) con los tipos de `?tipo=`. */
  mes(parametros: {
    readonly mes?: unknown;
    readonly tipo?: unknown;
  }): Promise<Calendario>;
};

type Dependencias = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
};

function elegirTipos(pedido: unknown): readonly TipoDeEntrada[] {
  const pedidos = Array.isArray(pedido) ? pedido : [pedido];
  const elegidos = TIPOS_DE_ENTRADA.filter((tipo) => pedidos.includes(tipo));
  return elegidos.length === 0 ? TIPOS_DE_ENTRADA : elegidos;
}

export function crearCasosUsoCalendario({
  transaccional,
  reloj,
}: Dependencias): CasosUsoCalendario {
  return {
    mes({ mes: pedido, tipo }) {
      const hoy = reloj.ahora();
      const mes = elegirMes(pedido, hoy);
      const tipos = elegirTipos(tipo);
      const { desde, hasta } = mes.rango;
      const delMes = (fecha: string) => fecha >= desde && fecha < hasta;
      const entrada = (
        datos: Omit<EntradaDelCalendario, "vencida">,
      ): EntradaDelCalendario => ({
        ...datos,
        vencida: estaVencido(hoy, datos.fecha),
      });

      return transaccional.ejecutar(async (repos) => {
        const entradas: EntradaDelCalendario[] = [];
        if (tipos.includes("vencimiento")) {
          for (const v of await repos.vencimientos.pendientesEntre(mes.rango)) {
            entradas.push(
              entrada({
                tipo: "vencimiento",
                fecha: v.fecha,
                titulo: `${v.descripcion} · ${v.servicioCodigo}`,
                importe: null,
                enlace: `/servicios/${v.servicioId}`,
              }),
            );
          }
        }
        if (tipos.includes("factura")) {
          for (const { factura, cliente, saldo } of await facturasPorCobrar(
            repos,
          )) {
            if (delMes(factura.valor.vencimiento)) {
              entradas.push(
                entrada({
                  tipo: "factura",
                  fecha: factura.valor.vencimiento,
                  titulo: `Factura ${factura.valor.numero} · ${cliente}`,
                  importe: formatearImporte(saldo.saldo),
                  enlace: `/servicios/facturas/${factura.valor.id}`,
                }),
              );
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
            if (fila.vencimiento !== null && delMes(fila.vencimiento)) {
              entradas.push(
                entrada({
                  tipo: "egreso",
                  fecha: fila.vencimiento,
                  titulo: fila.concepto,
                  importe: formatearImporte(fila.saldo),
                  enlace: `/egresos/${fila.id}`,
                }),
              );
            }
          }
        }
        if (tipos.includes("inicio")) {
          for (const s of await repos.servicios.inicioEstimadoEntre(
            mes.rango,
          )) {
            entradas.push(
              entrada({
                tipo: "inicio",
                fecha: s.fecha,
                titulo: `Inicio de ${s.codigo} · ${s.titulo}`,
                importe: null,
                enlace: `/servicios/${s.id}`,
              }),
            );
          }
        }
        const ordenadas = entradas.sort((a, b) =>
          a.fecha.localeCompare(b.fecha),
        );
        return {
          mes,
          tipos,
          entradas: ordenadas,
          semanas: armarSemanas(mes.mes, ordenadas),
        };
      });
    },
  };
}
