/**
 * Lo que las pantallas de Clientes suman a los datos del ABM: servicios vivos y
 * saldo por cobrar. Sale de las mismas consultas de Servicios y de Por cobrar,
 * sin reglas propias: el saldo es el de cada factura tal como lo calcula Por
 * cobrar, y vivo es todo servicio que no está en Cerrado ni en una salida.
 */

import {
  crearImporte,
  formatearImporte,
  type Moneda,
} from "../../../dominio/compartido/importe.ts";
import type { EstadoServicio } from "../../../dominio/servicios/estados.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { listadoDeServicios } from "../../../server/servicios.ts";

const SIN_VIDA: readonly EstadoServicio[] = [
  "cerrado",
  "perdido",
  "sin_respuesta",
  "cancelado",
];

export const estaVivo = (etapa: EstadoServicio): boolean =>
  !SIN_VIDA.includes(etapa);

/** `ARS 1.234,56` como moneda y centavos. */
function leerImporte(texto: string): { moneda: string; centavos: bigint } {
  const [moneda = "", ...resto] = texto.split(" ");
  const digitos = resto.join("").replace(/[^\d-]/g, "");
  return { moneda, centavos: BigInt(digitos === "" ? "0" : digitos) };
}

export function textoDe(moneda: string, centavos: bigint): string {
  return formatearImporte(crearImporte(centavos, moneda as Moneda));
}

/** Los importes por moneda como textos, ordenados por moneda. */
export function textosDe(porMoneda: ReadonlyMap<string, bigint>): string[] {
  return [...porMoneda]
    .filter(([, centavos]) => centavos !== 0n)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([moneda, centavos]) => textoDe(moneda, centavos));
}

export type Cobranza = {
  readonly saldo: Map<string, bigint>;
  readonly vencido: Map<string, bigint>;
};

function sumar(mapa: Map<string, bigint>, texto: string) {
  const { moneda, centavos } = leerImporte(texto);
  mapa.set(moneda, (mapa.get(moneda) ?? 0n) + centavos);
}

export type FilaPorCobrar = Awaited<
  ReturnType<ReturnType<typeof armado>["cobros"]["porCobrar"]>
>["filas"][number];

export type ResumenDeCliente = {
  readonly vivos: number;
  readonly cobranza: Cobranza;
};

/** Servicios vivos y saldo por cobrar de cada cliente, por id. */
export async function resumenDeClientes(): Promise<
  ReadonlyMap<string, ResumenDeCliente>
> {
  const [{ servicios }, { filas }] = await Promise.all([
    listadoDeServicios({
      buscar: "",
      clienteId: "",
      responsableId: "",
      tipoId: "",
    }),
    armado().cobros.porCobrar({}),
  ]);
  const clienteDe = new Map(servicios.map((s) => [s.id, s.cliente.id]));
  const resumen = new Map<string, { vivos: number; cobranza: Cobranza }>();
  const de = (id: string) => {
    let actual = resumen.get(id);
    if (actual === undefined) {
      actual = { vivos: 0, cobranza: { saldo: new Map(), vencido: new Map() } };
      resumen.set(id, actual);
    }
    return actual;
  };
  for (const s of servicios) {
    if (estaVivo(s.etapa)) {
      de(s.cliente.id).vivos += 1;
    }
  }
  for (const fila of filas) {
    const clienteId = clienteDe.get(fila.servicioId);
    if (clienteId === undefined) {
      continue;
    }
    const { cobranza } = de(clienteId);
    sumar(cobranza.saldo, fila.saldo);
    if (fila.atraso !== "") {
      sumar(cobranza.vencido, fila.saldo);
    }
  }
  return resumen;
}

/** El año de hoy, en la zona del negocio. */
export function anioActual(hoy: string): number {
  return Number(hoy.slice(0, 4));
}

/** Días de aviso del calendario (para el punto ámbar de un vencimiento). */
export async function diasDeAviso(): Promise<number> {
  const fila = await armado().prisma.configuracion.findUnique({
    where: { clave: "calendario.dias_de_aviso" },
    select: { valor: true },
  });
  const dias = Number.parseInt(fila?.valor ?? "", 10);
  return Number.isInteger(dias) && dias > 0 ? dias : 30;
}
