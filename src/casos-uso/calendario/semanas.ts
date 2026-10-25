/** La grilla del mes: semanas de lunes a domingo con las entradas de cada día. */

import {
  diferenciaEnDias,
  ultimoDiaDelMes,
} from "../../dominio/compartido/reloj.ts";
import { aFechaHora } from "../compartido/movimientos.ts";

type Fechada = { readonly fecha: string };

export type DiaDeLaGrilla<E extends Fechada> = {
  readonly dia: number;
  /** `aaaa-mm-dd`. */
  readonly fecha: string;
  readonly entradas: readonly E[];
};

/** Un lunes (1 de enero de 2001): de ahí se cuenta en qué día de la semana cae el 1 del mes. */
const UN_LUNES = aFechaHora("2001-01-01");

/**
 * Las semanas del mes `AAAA-MM`; los lugares de la primera y la última semana
 * que no son del mes quedan en `null`. `entradas` son las de ese mes.
 */
export function armarSemanas<E extends Fechada>(
  mes: string,
  entradas: readonly E[],
): readonly (readonly (DiaDeLaGrilla<E> | null)[])[] {
  const primero = aFechaHora(`${mes}-01`);
  const lugaresAntes = ((diferenciaEnDias(primero, UN_LUNES) % 7) + 7) % 7;
  const dias = Array.from(
    { length: ultimoDiaDelMes(primero.anio, primero.mes) },
    (_, i): DiaDeLaGrilla<E> => {
      const fecha = `${mes}-${String(i + 1).padStart(2, "0")}`;
      return {
        dia: i + 1,
        fecha,
        entradas: entradas.filter((entrada) => entrada.fecha === fecha),
      };
    },
  );
  const lugares = [
    ...Array.from({ length: lugaresAntes }, () => null),
    ...dias,
  ];
  const completo = [
    ...lugares,
    ...Array.from({ length: (7 - (lugares.length % 7)) % 7 }, () => null),
  ];
  return Array.from({ length: completo.length / 7 }, (_, semana) =>
    completo.slice(semana * 7, semana * 7 + 7),
  );
}
