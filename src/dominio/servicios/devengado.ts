/**
 * Lo devengado y lo que falta facturar de un servicio a una fecha, por moneda y
 * sin IVA, como la orden de compra (F3-03, ADR 0041). La fecha entra por
 * parámetro: nada acá mira el reloj del sistema.
 *
 * - Puntual: nada hasta «Finalizado»; desde ahí, el total de la orden.
 * - Por hitos (libre): lo devengado es lo facturado, y lo que falta facturar es
 *   el saldo de la orden (`saldoDeOrden`), no devengado − facturado.
 * - Mensual: la cuota vigente de cada mes, desde el de inicio hasta el de la
 *   fecha inclusive, con tope en el total de la orden.
 *
 * Fuera de por hitos, lo que falta facturar es devengado − facturado, y si se
 * facturó de más queda negativo: no se recorta.
 */

import {
  crearImporte,
  type Importe,
  MONEDAS,
  type Moneda,
} from "../compartido/importe.ts";
import { type FechaHora, sumarMeses } from "../compartido/reloj.ts";
import { restarEnMoneda } from "../compartido/saldo.ts";
import { sumaEn } from "./avance.ts";
import type { EstadoServicio, ModalidadDeFacturacion } from "./estados.ts";
import { saldoDeOrden } from "./orden-compra.ts";

/** Una cuota mensual sin IVA, que rige desde el mes de `desde` (solo cuentan su año y su mes). */
export interface Cuota {
  readonly desde: FechaHora;
  readonly importe: Importe<Moneda>;
}

export interface DatosDevengado {
  readonly modalidad: ModalidadDeFacturacion | null;
  readonly estado: EstadoServicio;
  /** El total de la orden de compra vigente, sin IVA. */
  readonly orden: Importe<Moneda> | null;
  /** Las facturas vigentes, sin IVA. */
  readonly facturas: readonly Importe<Moneda>[];
  /** En el orden en que se cargaron: la primera es la inicial y su mes, el de inicio. */
  readonly cuotas: readonly Cuota[];
  readonly fecha: FechaHora;
}

export interface DevengadoEnMoneda {
  readonly moneda: Moneda;
  readonly devengado: Importe<Moneda>;
  readonly facturado: Importe<Moneda>;
  readonly porFacturar: Importe<Moneda>;
}

const indiceDeMes = (fecha: FechaHora) => fecha.anio * 12 + fecha.mes - 1;

/**
 * La cuota que rige en el mes de `mes`: la del ajuste de mes más cercano,
 * anterior o igual; si dos son del mismo mes, la última cargada. `null` antes
 * de la primera.
 */
export function cuotaDelMes(
  cuotas: readonly Cuota[],
  mes: FechaHora,
): Importe<Moneda> | null {
  let vigente: Cuota | null = null;
  for (const cuota of cuotas) {
    const desde = indiceDeMes(cuota.desde);
    if (
      desde <= indiceDeMes(mes) &&
      (vigente === null || desde >= indiceDeMes(vigente.desde))
    ) {
      vigente = cuota;
    }
  }
  return vigente?.importe ?? null;
}

/** Las cuotas de cada mes, del de inicio al de `fecha` inclusive. */
function cuotasHasta(
  cuotas: readonly Cuota[],
  fecha: FechaHora,
): readonly Importe<Moneda>[] {
  const [inicial] = cuotas;
  const meses: Importe<Moneda>[] = [];
  for (
    let mes = inicial?.desde;
    mes !== undefined && indiceDeMes(mes) <= indiceDeMes(fecha);
    mes = sumarMeses(mes, 1)
  ) {
    const importe = cuotaDelMes(cuotas, mes);
    if (importe !== null) {
      meses.push(importe);
    }
  }
  return meses;
}

function devengadoEn(
  moneda: Moneda,
  datos: DatosDevengado,
  facturado: Importe<Moneda>,
): Importe<Moneda> {
  const { modalidad, estado, orden, cuotas, fecha } = datos;
  const deLaOrden = orden?.moneda === moneda ? orden : null;
  switch (modalidad) {
    case "puntual":
      return deLaOrden !== null &&
        (estado === "finalizado" || estado === "cerrado")
        ? deLaOrden
        : crearImporte(0n, moneda);
    case "por_hitos":
      return facturado;
    case "mensual": {
      const suma = sumaEn(moneda, cuotasHasta(cuotas, fecha));
      return deLaOrden !== null && suma.centavos > deLaOrden.centavos
        ? deLaOrden
        : suma;
    }
    case null:
      return crearImporte(0n, moneda);
  }
}

/** Una línea por cada moneda que aparece en la orden, las facturas o las cuotas, en el orden de `MONEDAS`. */
export function devengadoPorMoneda(
  datos: DatosDevengado,
): readonly DevengadoEnMoneda[] {
  const { modalidad, orden, facturas, cuotas } = datos;
  const importes = [
    ...(orden === null ? [] : [orden]),
    ...facturas,
    ...cuotas.map(({ importe }) => importe),
  ];
  return MONEDAS.filter((moneda) =>
    importes.some((importe) => importe.moneda === moneda),
  ).map((moneda) => {
    const facturado = sumaEn(moneda, facturas);
    const devengado = devengadoEn(moneda, datos, facturado);
    const porFacturar =
      modalidad !== "por_hitos"
        ? restarEnMoneda(devengado, facturado)
        : orden?.moneda === moneda
          ? saldoDeOrden(
              orden,
              facturas.map((importe) => ({ importe })),
            ).saldo
          : crearImporte(0n, moneda);
    return { moneda, devengado, facturado, porFacturar };
  });
}

/**
 * El mes que se propone facturar en modalidad mensual: el más antiguo, del de
 * inicio al de `fecha`, que no esté en `facturados`; si están todos, el de
 * `fecha`. Solo cuentan el año y el mes.
 */
export function periodoAFacturar(
  cuotas: readonly Cuota[],
  fecha: FechaHora,
  facturados: readonly FechaHora[],
): FechaHora {
  const [inicial] = cuotas;
  for (
    let mes = inicial?.desde;
    mes !== undefined && indiceDeMes(mes) <= indiceDeMes(fecha);
    mes = sumarMeses(mes, 1)
  ) {
    const indice = indiceDeMes(mes);
    if (!facturados.some((facturado) => indiceDeMes(facturado) === indice)) {
      return mes;
    }
  }
  return fecha;
}
