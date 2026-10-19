/**
 * El mes que se mira (F2-10): `?mes=AAAA-MM`, o el del reloj inyectado si no
 * viene o no es un mes. Los tramos son de días, con el último excluido
 * (`< primer día del mes siguiente`), así el borde del mes no se pierde ni se
 * cuenta dos veces.
 */

import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import {
  type FechaHora,
  formatearISO,
  parsearISO,
  sumarMeses,
} from "../../dominio/compartido/reloj.ts";
import type { Rango } from "../../puertos/repositorios/tablero.ts";
import { esquemaMes } from "../abm/abm.ts";

const NOMBRES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export type MesElegido = {
  /** `AAAA-MM`. */
  readonly mes: string;
  /** `octubre de 2026`. */
  readonly nombre: string;
  readonly rango: Rango;
  /** Los doce meses que terminan en este (el gráfico del inicio): el tramo y cada `AAAA-MM`. */
  readonly rangoDeDoceMeses: Rango;
  readonly doceMeses: readonly string[];
  readonly anterior: string;
  readonly siguiente: string;
  /** Lo pedido no era un mes: se muestra el del reloj. */
  readonly pedidoInvalido: boolean;
};

function primerDia(mes: string): FechaHora | null {
  if (!esquemaMes.safeParse(mes).success) {
    return null;
  }
  const resultado = parsearISO(`${mes}-01T00:00:00.000`);
  return resultado.ok ? resultado.fechaHora : null;
}

const mesDe = (fechaHora: FechaHora): string =>
  formatearISO(fechaHora).slice(0, 7);

/** El mes de `pedido` si es un `AAAA-MM`; si no, el de `hoy` (y lo avisa). */
export function elegirMes(pedido: unknown, hoy: FechaHora): MesElegido {
  const pedidoLeido = typeof pedido === "string" ? primerDia(pedido) : null;
  const inicio = pedidoLeido ?? primerDia(mesDe(hoy));
  if (inicio === null) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "el reloj dio una fecha que no es un mes",
    });
  }
  const siguiente = sumarMeses(inicio, 1);
  const hace11 = sumarMeses(inicio, -11);
  return {
    mes: mesDe(inicio),
    nombre: `${NOMBRES[inicio.mes - 1]} de ${inicio.anio}`,
    rango: {
      desde: formatearISO(inicio).slice(0, 10),
      hasta: formatearISO(siguiente).slice(0, 10),
    },
    rangoDeDoceMeses: {
      desde: formatearISO(hace11).slice(0, 10),
      hasta: formatearISO(siguiente).slice(0, 10),
    },
    doceMeses: Array.from({ length: 12 }, (_, i) =>
      mesDe(sumarMeses(hace11, i)),
    ),
    anterior: mesDe(sumarMeses(inicio, -1)),
    siguiente: mesDe(siguiente),
    pedidoInvalido: pedido !== undefined && pedidoLeido === null,
  };
}
