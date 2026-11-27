/**
 * Lo devengado y lo que falta facturar de un servicio a una fecha, por moneda y
 * sin IVA, como la orden de compra (F3-03, ADR 0041). La fecha entra por
 * parámetro: nada acá mira el reloj del sistema.
 *
 * - Puntual: nada hasta «Finalizado»; desde ahí, el total de la orden.
 * - Por hitos (libre): lo devengado es lo facturado, y lo que falta facturar es
 *   el saldo de la orden (`saldoDeOrden`), no devengado − facturado.
 * - Mensual: la cuota n (1, 2, …) se devenga el día del inicio real más n
 *   meses (mismo día del mes; si el mes no lo tiene, el último), con la cuota
 *   vigente en ese mes y tope en el total de la orden. Sin inicio real, nada.
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
import {
  diferenciaEnDias,
  type FechaHora,
  sumarMeses,
} from "../compartido/reloj.ts";
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
  /** Lo facturado que consume la orden, sin IVA y con signo: las facturas no adicionales y sus notas (F6-03). */
  readonly facturas: readonly Importe<Moneda>[];
  /** En el orden en que se cargaron: la primera es la inicial. */
  readonly cuotas: readonly Cuota[];
  /** El día en que empezó la ejecución (R6); `null` mientras no empezó. */
  readonly inicioReal: FechaHora | null;
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

/** Lo más que se cuentan cuotas: cien años, para que un dato roto no cuelgue el cálculo. */
const MAXIMO_DE_CUOTAS = 1200;

/** Cada cuota mensual con el día en que se devenga: la n, a n meses del inicio real. */
function cuotasDevengadas(
  cuotas: readonly Cuota[],
  inicio: FechaHora,
  fecha: FechaHora,
): readonly { readonly dia: FechaHora; readonly importe: Importe<Moneda> }[] {
  const [inicial] = cuotas;
  const devengadas: { dia: FechaHora; importe: Importe<Moneda> }[] = [];
  for (let n = 1; inicial !== undefined && n <= MAXIMO_DE_CUOTAS; n += 1) {
    const dia = sumarMeses(inicio, n);
    if (diferenciaEnDias(fecha, dia) < 0) {
      break;
    }
    devengadas.push({
      dia,
      importe: cuotaDelMes(cuotas, dia) ?? inicial.importe,
    });
  }
  return devengadas;
}

/**
 * La próxima cuota mensual a facturar: la primera que se devenga hoy o
 * después, con el tope de lo que le queda a la orden. `null` si no es mensual,
 * no está en ejecución, no tiene inicio real o la orden ya no admite más.
 */
export function proximaCuota(
  datos: Pick<
    DatosDevengado,
    "modalidad" | "estado" | "orden" | "cuotas" | "inicioReal" | "fecha"
  >,
): { readonly dia: FechaHora; readonly importe: Importe<Moneda> } | null {
  const { modalidad, estado, orden, cuotas, inicioReal, fecha } = datos;
  const [inicial] = cuotas;
  if (
    modalidad !== "mensual" ||
    estado !== "en_ejecucion" ||
    inicioReal === null ||
    inicial === undefined
  ) {
    return null;
  }
  let acumulado = 0n;
  for (let n = 1; n <= MAXIMO_DE_CUOTAS; n += 1) {
    const dia = sumarMeses(inicioReal, n);
    const importe = cuotaDelMes(cuotas, dia) ?? inicial.importe;
    const queda =
      orden?.moneda === importe.moneda
        ? orden.centavos - acumulado
        : importe.centavos;
    if (queda <= 0n) {
      return null;
    }
    if (diferenciaEnDias(dia, fecha) >= 0) {
      return {
        dia,
        importe: crearImporte(
          // biome-ignore lint/complexity/useMathMinMax: son bigint, sin Math.min
          queda < importe.centavos ? queda : importe.centavos,
          importe.moneda,
        ),
      };
    }
    acumulado += importe.centavos;
  }
  return null;
}

function devengadoEn(
  moneda: Moneda,
  datos: DatosDevengado,
  facturado: Importe<Moneda>,
): Importe<Moneda> {
  const { modalidad, estado, orden, cuotas, inicioReal, fecha } = datos;
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
      const suma = sumaEn(
        moneda,
        inicioReal === null
          ? []
          : cuotasDevengadas(cuotas, inicioReal, fecha).map(
              ({ importe }) => importe,
            ),
      );
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
